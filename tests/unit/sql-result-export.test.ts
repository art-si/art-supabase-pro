import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSqlResultSnapshot,
  exportSqlResultSnapshot
} from '../../src/views/data-center/sql-console/modules/result-compare'
import { createSqlResultExcelColumns } from '../../src/views/data-center/sql-console/modules/result-export'

test('snapshot JSON retains its provenance and typed scalar distinctions without numeric coercion', async () => {
  const row = {
    text: '9007199254740993.1234567890123456789',
    number: 1,
    boolean: false,
    null: null,
    undefined: undefined,
    literal: 'NULL',
    empty: '',
    integer: 9007199254740993n,
    nonfinite: Infinity
  }
  const snapshot = await createSqlResultSnapshot({
    rows: [row],
    columns: Object.keys(row).map((name) => ({ name, type: 'test-type' })),
    query: 'SELECT source',
    label: '原始结果',
    truncated: true
  })
  const exported = JSON.parse(exportSqlResultSnapshot(snapshot))
  assert.equal(exported.format, 'sql-result-snapshot')
  assert.equal(exported.version, 1)
  assert.equal(exported.scope, 'loaded-authorized-results')
  assert.equal(exported.capturedAt, snapshot.capturedAt)
  assert.equal(exported.label, '原始结果')
  assert.equal(exported.query, 'SELECT source')
  assert.equal(exported.truncated, true)
  assert.equal(exported.rowCount, 1)
  assert.equal(exported.estimatedBytes, snapshot.estimatedBytes)
  assert.equal(exported.rows[0].type, 'object')
  assert.deepEqual(exported.rows[0].entries, [
    ['text', { type: 'string', value: row.text }],
    ['number', { type: 'number', value: '1' }],
    ['boolean', { type: 'boolean', value: false }],
    ['null', { type: 'null' }],
    ['undefined', { type: 'undefined' }],
    ['literal', { type: 'string', value: 'NULL' }],
    ['empty', { type: 'string', value: '' }],
    ['integer', { type: 'bigint', value: '9007199254740993' }],
    ['nonfinite', { type: 'number', value: 'Infinity' }]
  ])
})

test('empty snapshots export zero rows together with ordered field metadata', async () => {
  const snapshot = await createSqlResultSnapshot({
    rows: [],
    columns: [
      { name: 'shown', property: 'actual', fullType: 'numeric(38,20)' },
      { name: 'other', type: 'text' }
    ]
  })
  const exported = JSON.parse(exportSqlResultSnapshot(snapshot))
  assert.equal(exported.rowCount, 0)
  assert.deepEqual(exported.rows, [])
  assert.deepEqual(exported.columns, [
    { name: 'shown', property: 'actual', fullType: 'numeric(38,20)' },
    { name: 'other', type: 'text' }
  ])
  assert.deepEqual(
    createSqlResultExcelColumns(snapshot).map(({ key, title }) => ({ key, title })),
    [
      { key: 'actual', title: 'shown' },
      { key: 'other', title: 'other' }
    ]
  )
})

test('JSON encodes nested undefined, bigint and user tag-shaped objects without collisions', async () => {
  const snapshot = await createSqlResultSnapshot({
    rows: [
      { payload: { value: undefined, list: [1n, { type: 'bigint', value: 'ordinary text' }] } }
    ],
    columns: [{ name: 'payload', type: 'jsonb' }]
  })
  const exported = JSON.parse(exportSqlResultSnapshot(snapshot))
  assert.deepEqual(exported.rows[0].entries, [
    [
      'payload',
      {
        type: 'object',
        entries: [
          ['value', { type: 'undefined' }],
          [
            'list',
            {
              type: 'array',
              value: [
                { type: 'bigint', value: '1' },
                {
                  type: 'object',
                  entries: [
                    ['type', { type: 'string', value: 'bigint' }],
                    ['value', { type: 'string', value: 'ordinary text' }]
                  ]
                }
              ]
            }
          ]
        ]
      }
    ]
  ])
})

test('Excel maps provider property names while keeping exact text, booleans and NULL behavior', async () => {
  const raw = {
    actual: '9007199254740993.0000000001',
    text: '  001.00  ',
    boolean: false,
    number: 0.1,
    null: null,
    missing: undefined,
    jsonText: '{"exact":9007199254740993}'
  }
  const snapshot = await createSqlResultSnapshot({
    rows: [raw],
    columns: [
      { name: 'amount', property: 'actual', type: 'numeric' },
      ...Object.keys(raw)
        .filter((key) => key !== 'actual')
        .map((name) => ({ name }))
    ]
  })
  const specs = createSqlResultExcelColumns(snapshot)
  assert.equal(specs[0].key, 'actual')
  assert.equal(specs[0].title, 'amount')
  const cells = specs.map((spec) =>
    spec.formatter?.(Reflect.get(snapshot.rows[0], String(spec.key)), snapshot.rows[0], 0)
  )
  assert.deepEqual(cells, [
    '9007199254740993.0000000001',
    '  001.00  ',
    'false',
    '0.1',
    'NULL',
    '',
    '{"exact":9007199254740993}'
  ])
})

test('Excel object JSON supports nested bigint as decimal text and never modifies the snapshot', async () => {
  const snapshot = await createSqlResultSnapshot({
    rows: [
      {
        payload: { integer: 9007199254740993n, list: [123n, null, false] },
        bigint: 12345678901234567890n
      }
    ],
    columns: [{ name: 'payload' }, { name: 'bigint' }]
  })
  const specs = createSqlResultExcelColumns(snapshot)
  assert.equal(
    specs[0].formatter?.(null, snapshot.rows[0], 0),
    '{"integer":"9007199254740993","list":["123",null,false]}'
  )
  assert.equal(specs[1].formatter?.(null, snapshot.rows[0], 0), '12345678901234567890')
  assert.equal((snapshot.rows[0].payload as { integer: bigint }).integer, 9007199254740993n)
})

test('prototype-like names remain own exported data and missing fields never read inherited values', async () => {
  const row = Object.fromEntries([
    ['__proto__', { safe: 'own' }],
    ['constructor', 'own constructor']
  ])
  const snapshot = await createSqlResultSnapshot({
    rows: [row],
    columns: [{ name: '__proto__' }, { name: 'constructor' }, { name: 'toString' }]
  })
  const exported = JSON.parse(exportSqlResultSnapshot(snapshot))
  assert.deepEqual(
    exported.rows[0].entries.map((entry: [string, unknown]) => entry[0]),
    ['__proto__', 'constructor']
  )
  const specs = createSqlResultExcelColumns(snapshot)
  assert.deepEqual(
    specs.map((spec) => spec.title),
    ['__proto__', 'constructor', 'toString']
  )
  assert.deepEqual(
    specs.map((spec) =>
      spec.formatter?.(Reflect.get(snapshot.rows[0], String(spec.key)), snapshot.rows[0], 0)
    ),
    ['{"safe":"own"}', 'own constructor', '']
  )
  assert.equal(Object.getPrototypeOf(snapshot.rows[0]), Object.prototype)
})

test('export includes every loaded snapshot row, excluding undeclared properties and later raw mutations', async () => {
  const raw = [
    { id: 1, value: 'first', hidden: 'not authorized' },
    { id: 2, value: 'second', hidden: 'not authorized' }
  ]
  const snapshot = await createSqlResultSnapshot({
    rows: raw,
    columns: [{ name: 'id' }, { name: 'value' }]
  })
  raw[0].value = 'later mutation'
  const json = exportSqlResultSnapshot(snapshot)
  assert.equal(JSON.parse(json).rowCount, 2)
  assert.equal(json.includes('not authorized'), false)
  assert.equal(json.includes('later mutation'), false)
  assert.equal(json.includes('first'), true)
})
