import assert from 'node:assert/strict'
import test from 'node:test'
import { reactive } from 'vue'
import {
  createSqlResultSnapshot as snapshot,
  compareSqlResults as compare,
  exportSqlResultComparison,
  exportSqlResultSnapshot,
  formatComparisonValue,
  SqlResultCompareError,
  type SqlResultCompareColumn
} from '../../src/views/data-center/sql-console/modules/result-compare'

const columns: SqlResultCompareColumn[] = [
  { name: 'id', type: 'integer' },
  { name: 'value', type: 'text' }
]
const errorCode = (code: SqlResultCompareError['code']) => (error: unknown) =>
  error instanceof SqlResultCompareError && error.code === code

test('snapshots clone every loaded authorized value and metadata without retaining undeclared fields', async () => {
  const rows = [{ id: 1, value: { nested: ['original'] }, private: new Date() }]
  const cols = columns.map((column) => ({ ...column }))
  const baseline = await snapshot({
    rows,
    columns: cols,
    label: 'baseline',
    query: 'SELECT original',
    truncated: true
  })
  rows[0].value.nested[0] = 'mutated'
  cols[1].type = 'jsonb'
  assert.deepEqual(baseline.rows, [{ id: 1, value: { nested: ['original'] } }])
  assert.equal(baseline.columns[1].type, 'text')
  assert.equal(baseline.truncated, true)
  assert.equal(baseline.query, 'SELECT original')
  assert.ok(Number.isFinite(Date.parse(baseline.capturedAt)))
  assert.ok(baseline.estimatedBytes > 0)
})

test('comparison matches unique keys rather than query order and keeps original row references and indices', async () => {
  const baseline = await snapshot({
    rows: [
      { id: 1, value: 'old' },
      { id: 2, value: 'same' },
      { id: 3, value: 'removed' }
    ],
    columns
  })
  const current = await snapshot({
    rows: [
      { id: 2, value: 'same' },
      { id: 4, value: 'added' },
      { id: 1, value: 'new' }
    ],
    columns
  })
  const result = await compare(baseline, current, ['id'])
  assert.deepEqual(
    [result.addedCount, result.removedCount, result.modifiedCount, result.unchangedCount],
    [1, 1, 1, 1]
  )
  assert.equal(result.modified[0].before, baseline.rows[0])
  assert.equal(result.modified[0].after, current.rows[2])
  assert.equal(result.modified[0].baselineIndex, 0)
  assert.equal(result.modified[0].currentIndex, 2)
  assert.deepEqual(result.modified[0].changedFields, ['value'])
  assert.equal(result.unchanged[0].before, baseline.rows[1])
  assert.equal(result.unchanged[0].currentIndex, 0)
  assert.equal(Object.hasOwn(result.baseline, 'rows'), false)
})

test('empty rows are a valid baseline and current clearing never requires positional guessing', async () => {
  const empty = await snapshot({ rows: [], columns })
  const filled = await snapshot({ rows: [{ id: 0, value: '' }], columns })
  assert.equal((await compare(empty, filled, ['id'])).addedCount, 1)
  assert.equal((await compare(filled, empty, ['id'])).removedCount, 1)
  assert.equal((await compare(empty, empty, ['id'])).unchangedCount, 0)
})

test('keys distinguish types and composite separators without collisions, allowing zero and empty strings', async () => {
  const rows = [{ id: 1 }, { id: '1' }, { id: 1n }, { id: true }, { id: 0 }, { id: '' }]
  const base = await snapshot({ rows, columns: [{ name: 'id' }] })
  const result = await compare(
    base,
    await snapshot({ rows: [...rows].reverse(), columns: [{ name: 'id' }] }),
    ['id']
  )
  assert.equal(result.unchangedCount, 6)
  assert.equal(new Set(result.unchanged.map((row) => row.key)).size, 6)
  const compositeColumns = [{ name: 'a' }, { name: 'b' }]
  const composite = await snapshot({
    rows: [
      { a: 'a|b', b: 'c' },
      { a: 'a', b: 'b|c' }
    ],
    columns: compositeColumns
  })
  assert.equal((await compare(composite, composite, ['a', 'b'])).unchangedCount, 2)
})

test('invalid key values report the side and one-based row without overwriting a Map entry', async () => {
  const good = await snapshot({ rows: [{ id: 1 }], columns: [{ name: 'id' }] })
  for (const value of [null, undefined, {}, [], Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
    const bad = await snapshot({ rows: [{ id: value }], columns: [{ name: 'id' }] })
    for (const side of ['baseline', 'current'] as const)
      await assert.rejects(
        compare(side === 'baseline' ? bad : good, side === 'current' ? bad : good, ['id']),
        (error: unknown) => {
          assert.ok(error instanceof SqlResultCompareError)
          assert.equal(error.code, 'INVALID_KEY_VALUE')
          assert.equal(error.side, side)
          assert.equal(error.rowNumber, 1)
          return true
        }
      )
  }
})

test('duplicate unique keys identify both conflicting rows on each side', async () => {
  const good = await snapshot({ rows: [{ id: 0 }], columns })
  const duplicate = await snapshot({ rows: [{ id: 0 }, { id: 0 }], columns })
  for (const side of ['baseline', 'current'] as const)
    await assert.rejects(
      compare(side === 'baseline' ? duplicate : good, side === 'current' ? duplicate : good, [
        'id'
      ]),
      (error: unknown) => {
        assert.ok(error instanceof SqlResultCompareError)
        assert.equal(error.code, 'DUPLICATE_KEY')
        assert.equal(error.side, side)
        assert.equal(error.rowNumber, 2)
        assert.equal(error.duplicateRowNumber, 1)
        return true
      }
    )
})

test('common selected keys are mandatory and missing prototype-named properties are not inherited', async () => {
  const base = await snapshot({ rows: [{ id: 1 }], columns })
  for (const keys of [[], ['id', 'id'], ['other']])
    await assert.rejects(compare(base, base, keys), errorCode('INVALID_KEYS'))
  const prototype = await snapshot({ rows: [{}], columns: [{ name: 'toString' }] })
  await assert.rejects(compare(prototype, prototype, ['toString']), errorCode('INVALID_KEY_VALUE'))
})

test('schema additions, removals and type changes are separate while metadata-only changes leave rows unchanged', async () => {
  const baseline = await snapshot({ rows: [{ id: 1, value: '1.00' }], columns })
  const changedType = await snapshot({
    rows: [{ id: 1, value: '1.00' }],
    columns: [
      { name: 'value', type: 'numeric(18,2)' },
      { name: 'id', type: 'integer' }
    ]
  })
  const metadataOnly = await compare(baseline, changedType, ['id'])
  assert.equal(metadataOnly.unchangedCount, 1)
  assert.deepEqual(metadataOnly.schemaChanges, [
    { name: 'value', kind: 'type-changed', beforeType: 'text', afterType: 'numeric(18,2)' }
  ])
  const current = await snapshot({
    rows: [{ id: 1, added: undefined }],
    columns: [{ name: 'id', type: 'integer' }, { name: 'added' }]
  })
  const result = await compare(baseline, current, ['id'])
  assert.deepEqual(
    result.schemaChanges.map((change) => [change.name, change.kind]),
    [
      ['value', 'removed'],
      ['added', 'added']
    ]
  )
  assert.deepEqual(result.modified[0].changedFields, ['value', 'added'])
})

test('presence, NULL, undefined and original scalar types remain distinct, without numeric string coercion', async () => {
  const baseline = await snapshot({
    rows: [
      { id: 1 },
      { id: 2, value: undefined },
      { id: 3, value: '9007199254740993.0000000001' },
      { id: 4, value: '1.00' },
      { id: 5, value: '1' }
    ],
    columns
  })
  const current = await snapshot({
    rows: [
      { id: 1, value: undefined },
      { id: 2, value: null },
      { id: 3, value: '9007199254740993.0000000002' },
      { id: 4, value: '1' },
      { id: 5, value: 1 }
    ],
    columns
  })
  const result = await compare(baseline, current, ['id'])
  assert.equal(result.modifiedCount, 5)
  assert.equal(result.modified[2].before?.value, '9007199254740993.0000000001')
  assert.equal(Object.hasOwn(baseline.rows[0], 'value'), false)
  assert.equal(Object.hasOwn(baseline.rows[1], 'value'), true)
})

test('JSON object key order is irrelevant, arrays retain order, and provider property mappings are independent', async () => {
  const baseline = await snapshot({
    rows: [{ key: 1, value: { a: 1, b: [1, 2] } }],
    columns: [{ name: 'id', property: 'key' }, { name: 'value' }]
  })
  const current = await snapshot({
    rows: [{ id: 1, renamed: { b: [1, 2], a: 1 } }],
    columns: [{ name: 'id' }, { name: 'value', property: 'renamed' }]
  })
  assert.equal((await compare(baseline, current, ['id'])).unchangedCount, 1)
  current.rows[0].renamed = { a: 1, b: [2, 1] }
  assert.deepEqual((await compare(baseline, current, ['id'])).modified[0].changedFields, ['value'])
})

test('snapshots reject ambiguous columns, oversized data and excessive depth instead of truncating', async () => {
  for (const cols of [
    [],
    [{ name: '' }],
    [{ name: 'x' }, { name: 'x' }],
    [
      { name: 'a', property: 'x' },
      { name: 'b', property: 'x' }
    ]
  ])
    await assert.rejects(snapshot({ rows: [], columns: cols }), errorCode('INVALID_COLUMNS'))
  const pivot = Array.from({ length: 365 }, (_, index) => ({ name: `day_${index}` }))
  assert.equal((await snapshot({ rows: [], columns: pivot })).columns.length, 365)
  await assert.rejects(
    snapshot({
      rows: [],
      columns: Array.from({ length: 4097 }, (_, index) => ({ name: `${index}` }))
    }),
    errorCode('INVALID_COLUMNS')
  )
  await assert.rejects(
    snapshot({ rows: Array.from({ length: 1001 }, () => ({ id: 1 })), columns }),
    errorCode('SNAPSHOT_LIMIT')
  )
  await assert.rejects(
    snapshot({ rows: [{ id: 1, value: 'x'.repeat(4 * 1024 * 1024) }], columns }),
    errorCode('SNAPSHOT_LIMIT')
  )
  let deep: unknown = 'leaf'
  for (let index = 0; index < 34; index++) deep = { nested: deep }
  await assert.rejects(
    snapshot({ rows: [{ id: 1, value: deep }], columns }),
    errorCode('UNSUPPORTED_VALUE')
  )
})

test('unsupported objects, accessors, cycles and sparse arrays fail clearly without invoking user methods', async () => {
  const cycle: Record<string, unknown> = {}
  cycle.self = cycle
  const accessor = Object.defineProperty({}, 'value', {
    enumerable: true,
    get() {
      assert.fail('getter must not run')
    }
  })
  const hidden = Object.defineProperty({}, 'hidden', { value: 1 })
  for (const value of [
    new Date(),
    new Map(),
    new Set(),
    /x/,
    () => 1,
    Symbol('x'),
    cycle,
    accessor,
    hidden,
    Array(2),
    {
      toJSON() {
        assert.fail('toJSON must not run')
      }
    }
  ])
    await assert.rejects(
      snapshot({ rows: [{ id: 1, value }], columns }),
      errorCode('UNSUPPORTED_VALUE')
    )
  const row = Object.defineProperty({ id: 1 }, 'value', {
    get() {
      assert.fail('row getter must not run')
    }
  })
  await assert.rejects(snapshot({ rows: [row], columns }), errorCode('UNSUPPORTED_VALUE'))
})

test('prototype-like fields are own data, and long common key previews never become machine identity', async () => {
  const cols = [{ name: 'id' }, { name: '__proto__' }, { name: 'constructor' }]
  const makeRow = (id: string, value: number) =>
    Object.fromEntries([
      ['id', id],
      ['__proto__', { safe: value }],
      ['constructor', 'own']
    ])
  const prefix = 'same-prefix'.repeat(40)
  const baseline = await snapshot({
    rows: [makeRow(prefix + 'A', 1), makeRow(prefix + 'B', 2)],
    columns: cols
  })
  const current = await snapshot({
    rows: [makeRow(prefix + 'B', 3), makeRow(prefix + 'A', 2)],
    columns: cols
  })
  const result = await compare(baseline, current, ['id'])
  assert.equal(result.modifiedCount, 2)
  assert.equal(result.modified[0].identity, result.modified[1].identity)
  assert.notEqual(result.modified[0].key, result.modified[1].key)
  assert.deepEqual(result.modified[0].changedFields, ['__proto__'])
  assert.equal(Object.getPrototypeOf(baseline.rows[0]), Object.prototype)
})

test('snapshot and comparison batches honor abort without mutating original results', async () => {
  const controller = new AbortController()
  const rows = Array.from({ length: 300 }, (_, id) => ({ id, value: 'original' }))
  await assert.rejects(
    snapshot(
      { rows, columns },
      { signal: controller.signal, yieldControl: async () => controller.abort() }
    ),
    { name: 'AbortError' }
  )
  assert.equal(rows[0].value, 'original')
  const baseline = await snapshot({ rows, columns })
  const compareController = new AbortController()
  await assert.rejects(
    compare(baseline, baseline, ['id'], {
      signal: compareController.signal,
      yieldControl: async () => compareController.abort()
    }),
    { name: 'AbortError' }
  )
  assert.equal(baseline.rows.length, 300)
})

test('exports preserve bigint, nonfinite numbers and nested undefined with collision-free typed values, excluding unchanged data', async () => {
  const baseline = await snapshot({
    rows: [
      { id: 1n, value: { gone: undefined, tag: { type: 'bigint', value: 'fake' } } },
      { id: 2n, value: 'unchanged-private' }
    ],
    columns
  })
  const current = await snapshot({
    rows: [
      { id: 1n, value: { integer: 9007199254740993n, number: Infinity } },
      { id: 2n, value: 'unchanged-private' }
    ],
    columns
  })
  const result = await compare(baseline, current, ['id'])
  const json = exportSqlResultComparison(result)
  const exported = JSON.parse(json)
  assert.equal(exported.format, 'sql-result-comparison')
  assert.equal(exported.version, 1)
  assert.equal(exported.unchangedCount, 1)
  assert.equal(Object.hasOwn(exported, 'unchanged'), false)
  assert.equal(json.includes('unchanged-private'), false)
  assert.deepEqual(exported.modified[0].after.entries[0], ['id', { type: 'bigint', value: '1' }])
  assert.deepEqual(exported.modified[0].after.entries[1][1].entries, [
    ['integer', { type: 'bigint', value: '9007199254740993' }],
    ['number', { type: 'number', value: 'Infinity' }]
  ])
  assert.equal(formatComparisonValue(undefined, false), '（字段缺失）')
  assert.equal(formatComparisonValue(undefined), 'undefined')
  assert.equal(formatComparisonValue(''), '""')
  assert.equal(formatComparisonValue(1n), '1n')
  assert.match(formatComparisonValue(baseline.rows[0].value), /"undefined"/)
})

test('snapshot inspection copies nested proxy descriptors without re-reading Vue-reserved properties', async () => {
  const nested = {
    hasOwnProperty: 'nested data',
    __v_isReactive: 'stored reactive text',
    __v_isReadonly: false,
    __v_isShallow: 'stored shallow text',
    __v_raw: null,
    absent: undefined
  }
  const fakeRef = { __v_isRef: true, value: 'literal ref value', extra: 'keep this property' }
  const row = {
    id: 1,
    hasOwnProperty: 'row data',
    __v_isReactive: 'row reactive text',
    __v_raw: null,
    payload: reactive(nested),
    list: reactive([reactive(nested), fakeRef]),
    fakeRef,
    rawString: { __v_raw: 'literal raw string', value: 'real data' },
    rawObject: { __v_raw: { literal: 'raw object' }, value: 'real object data' }
  }
  const result = await snapshot({
    rows: [reactive(row)],
    columns: Object.keys(row).map((name) => ({ name }))
  })
  assert.deepEqual(result.rows[0], {
    ...row,
    payload: nested,
    list: [nested, fakeRef]
  })
  const jsonBeforeMutation = exportSqlResultSnapshot(result)
  nested.hasOwnProperty = 'later mutation'
  fakeRef.extra = 'later ref mutation'
  row.rawObject.__v_raw.literal = 'later raw mutation'
  assert.equal(exportSqlResultSnapshot(result), jsonBeforeMutation)
  const payload = result.rows[0].payload
  assert.ok(payload !== null && typeof payload === 'object')
  assert.equal(Object.hasOwn(payload, 'absent'), true)
  assert.equal(Object.getPrototypeOf(result.rows[0]), Object.prototype)
})

test('reactive reports export exact own row and nested values instead of Vue proxy metadata', async () => {
  const make = (value: string) => ({
    id: 1,
    hasOwnProperty: value,
    __v_isReactive: `${value}-reactive`,
    __v_isReadonly: false,
    __v_isShallow: `${value}-shallow`,
    __v_raw: null,
    payload: {
      hasOwnProperty: `${value}-nested`,
      __v_isReactive: `${value}-nested-reactive`,
      __v_raw: null
    },
    fakeRef: { __v_isRef: true, value, extra: `${value}-extra` },
    list: [{ hasOwnProperty: `${value}-array`, __v_raw: null }]
  })
  const cols = Object.keys(make('baseline')).map((name) => ({ name }))
  const baseline = await snapshot({ rows: [make('baseline')], columns: cols })
  const current = await snapshot({ rows: [make('current')], columns: cols })
  const report = await compare(baseline, current, ['id'])
  const encoded = exportSqlResultComparison(report)
  assert.equal(exportSqlResultComparison(reactive(report)), encoded)
  assert.equal(exportSqlResultSnapshot(reactive(current)), exportSqlResultSnapshot(current))
  assert.equal(
    formatComparisonValue(reactive(make('preview').payload)),
    formatComparisonValue(make('preview').payload)
  )
  const exported = JSON.parse(encoded)
  const entries = exported.modified[0].after.entries
  assert.deepEqual(entries[1], ['hasOwnProperty', { type: 'string', value: 'current' }])
  assert.deepEqual(entries[5], ['__v_raw', { type: 'null' }])
  assert.deepEqual(entries[7][1].entries, [
    ['__v_isRef', { type: 'boolean', value: true }],
    ['value', { type: 'string', value: 'current' }],
    ['extra', { type: 'string', value: 'current-extra' }]
  ])
  assert.equal(encoded.includes('"type": "function"'), false)
})

test('reactive snapshot comparison reads own special keys and detects their original changes', async () => {
  const cols = [{ name: 'hasOwnProperty' }, { name: '__v_isReactive' }, { name: '__v_raw' }]
  const baseline = await snapshot({
    rows: [{ hasOwnProperty: 'key', __v_isReactive: 'before', __v_raw: null }],
    columns: cols
  })
  const current = await snapshot({
    rows: [{ hasOwnProperty: 'key', __v_isReactive: 'after', __v_raw: null }],
    columns: cols
  })
  const rawBefore = exportSqlResultSnapshot(baseline)
  const rawAfter = exportSqlResultSnapshot(current)
  const report = await compare(reactive(baseline), reactive(current), ['hasOwnProperty'])
  assert.equal(report.modifiedCount, 1)
  assert.deepEqual(report.modified[0].changedFields, ['__v_isReactive'])
  assert.match(report.modified[0].identity, /hasOwnProperty \(string\) = "key"/)
  assert.equal(exportSqlResultSnapshot(baseline), rawBefore)
  assert.equal(exportSqlResultSnapshot(current), rawAfter)
})

test('literal own raw-marker strings and objects remain user data at every snapshot level', async () => {
  const rows = [
    { id: 1, __v_raw: 'literal row text', payload: { __v_raw: 'literal nested text' } },
    {
      id: 2,
      __v_raw: { own: 'literal row object' },
      payload: { __v_raw: { own: 'literal nested object' } }
    }
  ]
  const result = await snapshot({
    rows,
    columns: [{ name: 'id' }, { name: '__v_raw' }, { name: 'payload' }]
  })
  assert.deepEqual(result.rows, rows)
  const encoded = exportSqlResultSnapshot(result)
  assert.equal(exportSqlResultSnapshot(reactive(result)), encoded)
  const exported = JSON.parse(encoded)
  assert.deepEqual(exported.rows[0].entries[1], [
    '__v_raw',
    { type: 'string', value: 'literal row text' }
  ])
  assert.deepEqual(exported.rows[1].entries[1], [
    '__v_raw',
    { type: 'object', entries: [['own', { type: 'string', value: 'literal row object' }]] }
  ])
})

test('reactive difference wrappers cannot unwrap complete fake-ref rows before typed export', async () => {
  const make = (id: number, value: string) => ({
    id,
    __v_isRef: true,
    value,
    extra: `${value}-extra`
  })
  const cols = Object.keys(make(1, 'before')).map((name) => ({ name }))
  const baseline = await snapshot({
    rows: [make(1, 'before'), make(3, 'removed')],
    columns: cols
  })
  const current = await snapshot({
    rows: [make(1, 'after'), make(2, 'added')],
    columns: cols
  })
  const report = await compare(baseline, current, ['id'])
  const raw = exportSqlResultComparison(report)
  assert.deepEqual(JSON.parse(exportSqlResultComparison(reactive(report))), JSON.parse(raw))
  const exported = JSON.parse(raw)
  for (const [entry, side, expected] of [
    [exported.modified[0], 'before', 'before'],
    [exported.modified[0], 'after', 'after'],
    [exported.added[0], 'after', 'added'],
    [exported.removed[0], 'before', 'removed']
  ]) {
    assert.equal(entry[side].type, 'object')
    assert.deepEqual(entry[side].entries.slice(1), [
      ['__v_isRef', { type: 'boolean', value: true }],
      ['value', { type: 'string', value: expected }],
      ['extra', { type: 'string', value: `${expected}-extra` }]
    ])
  }
  assert.equal(Object.hasOwn(exported.added[0], 'before'), false)
  assert.equal(Object.hasOwn(exported.removed[0], 'after'), false)
})
