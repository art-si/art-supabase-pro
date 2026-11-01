import assert from 'node:assert/strict'
import test from 'node:test'
import { reactive } from 'vue'
import {
  getSqlResultSortKind,
  sortSqlResultRows,
  type SqlResultSortColumn
} from '../../src/views/data-center/sql-console/modules/result-sort'

const numeric: SqlResultSortColumn = { name: 'value', type: 'numeric' }
const ids = (rows: Record<string, unknown>[]) => rows.map((row) => row.id)

test('sort kinds honor full database types and reject structured or binary columns', () => {
  for (const [type, expected] of [
    ['NUMERIC(100,50)', 'number'],
    ['bigint', 'number'],
    ['double precision', 'number'],
    ['boolean', 'boolean'],
    ['bit(1)', 'number'],
    ['bit', 'number'],
    ['bit(8)', 'unsupported'],
    ['date', 'date'],
    ['timestamp(9) without time zone', 'datetime'],
    ['timestamptz', 'datetime'],
    ['datetime(6)', 'datetime'],
    ['time(9) with time zone', 'time'],
    ['timetz', 'time'],
    ['varchar(255)', 'text'],
    ['uuid', 'text'],
    ['', 'text'],
    ['jsonb', 'unsupported'],
    ['integer[]', 'unsupported'],
    ['ARRAY', 'unsupported'],
    ['bytea', 'unsupported'],
    ['xml', 'unsupported'],
    ['interval', 'unsupported']
  ])
    assert.equal(getSqlResultSortKind({ name: 'value', type }), expected, type)
  assert.equal(
    getSqlResultSortKind({ name: 'value', type: 'text', fullType: 'numeric(100,30)' }),
    'number'
  )
})

test('all 1000 loaded rows are sorted before pagination without changing source order or references', () => {
  const rows = Object.freeze(
    Array.from({ length: 1000 }, (_, index) =>
      Object.freeze({ id: index, value: `${1000 - index}` })
    )
  )
  const ascending = sortSqlResultRows(rows, numeric, 'ascending')
  assert.equal(ascending.rows.length, 1000)
  assert.equal(ascending.rows[0], rows[999])
  assert.equal(ascending.rows[49], rows[950])
  assert.equal(ascending.rows[999], rows[0])
  assert.deepEqual(ids(sortSqlResultRows(rows, numeric, 'descending').rows), ids([...rows]))
  assert.equal(rows[0].value, '1000')
  assert.notEqual(ascending.rows, rows)
  assert.equal(ascending.nullCount, 0)
  assert.equal(ascending.excludedCount, 0)
  assert.equal(ascending.message, undefined)
})

test('numeric comparisons retain huge integers, arbitrarily separated exponents and decimal text precision', () => {
  const rows = [
    { id: 'huge', value: '1e1024' },
    { id: 'tiny', value: '1e-1024' },
    { id: 'zero', value: '0' },
    { id: 'negative', value: '-1e1024' },
    { id: 'precise-b', value: '0.1234567890123456789012345678900002' },
    { id: 'precise-a', value: '0.1234567890123456789012345678900001' },
    { id: 'bigint', value: 9223372036854775807n }
  ]
  assert.deepEqual(ids(sortSqlResultRows(rows, numeric, 'ascending').rows), [
    'negative',
    'zero',
    'tiny',
    'precise-a',
    'precise-b',
    'bigint',
    'huge'
  ])
  const prefix = '9'.repeat(3999)
  const wide = [
    { id: 'b', value: `${prefix}9` },
    { id: 'a', value: `${prefix}8` }
  ]
  assert.deepEqual(ids(sortSqlResultRows(wide, numeric, 'ascending').rows), ['a', 'b'])
  assert.equal(sortSqlResultRows(wide, numeric, 'ascending').excludedCount, 0)
})

test('equal numeric values stay stable across raw scalar types and both sort directions', () => {
  const rows = [
    { id: 'text', value: '1.0000' },
    { id: 'bigint', value: 1n },
    { id: 'number', value: 1 },
    { id: 'exponent', value: '1e0' },
    { id: 'zero', value: -0 }
  ]
  assert.deepEqual(ids(sortSqlResultRows(rows, numeric, 'ascending').rows), [
    'zero',
    'text',
    'bigint',
    'number',
    'exponent'
  ])
  assert.deepEqual(ids(sortSqlResultRows(rows, numeric, 'descending').rows), [
    'text',
    'bigint',
    'number',
    'exponent',
    'zero'
  ])
})

test('NULL and excluded numeric values share a stable tail and are counted separately', () => {
  const rows = [
    { id: 'null', value: null },
    { id: 'two', value: '2' },
    { id: 'unsafe', value: Number.MAX_SAFE_INTEGER + 1 },
    { id: 'undefined', value: undefined },
    { id: 'blank', value: ' ' },
    { id: 'zero', value: '0' },
    { id: 'missing' },
    { id: 'nan', value: NaN },
    { id: 'infinity', value: Infinity },
    { id: 'boolean', value: false },
    { id: 'object', value: { value: '3' } },
    { id: 'oversized', value: '9'.repeat(4097) }
  ]
  const tail = [
    'null',
    'unsafe',
    'undefined',
    'blank',
    'missing',
    'nan',
    'infinity',
    'boolean',
    'object',
    'oversized'
  ]
  const asc = sortSqlResultRows(rows, numeric, 'ascending')
  assert.deepEqual(ids(asc.rows), ['zero', 'two', ...tail])
  assert.equal(asc.nullCount, 3)
  assert.equal(asc.excludedCount, 7)
  assert.match(asc.message || '', /7 个值无法可靠比较/)
  assert.deepEqual(ids(sortSqlResultRows(rows, numeric, 'descending').rows), [
    'two',
    'zero',
    ...tail
  ])
})

test('text sorting uses Chinese collation and preserves text numbers, whitespace and strict value types', () => {
  const rows = [
    { id: 'numeric-text-two', value: '2' },
    { id: 'numeric-text-ten', value: '10' },
    { id: 'bo', value: '波' },
    { id: 'a', value: '阿' },
    { id: 'wrong-number', value: 1 },
    { id: 'empty', value: '' },
    { id: 'space', value: ' ' }
  ]
  const result = sortSqlResultRows(rows, { name: 'value', type: 'varchar' }, 'ascending')
  assert.deepEqual(ids(result.rows), [
    'empty',
    'space',
    'numeric-text-ten',
    'numeric-text-two',
    'a',
    'bo',
    'wrong-number'
  ])
  assert.equal(result.nullCount, 0)
  assert.equal(result.excludedCount, 1)
})

test('boolean sorting compares only strict boolean values, without coercing false-like text or zero', () => {
  const rows = [
    { id: 'true', value: true },
    { id: 'string', value: 'false' },
    { id: 'false-a', value: false },
    { id: 'zero', value: 0 },
    { id: 'false-b', value: false }
  ]
  const result = sortSqlResultRows(rows, { name: 'value', type: 'boolean' }, 'ascending')
  assert.deepEqual(ids(result.rows), ['false-a', 'false-b', 'true', 'string', 'zero'])
  assert.equal(result.excludedCount, 2)
})

test('single-bit columns sort numeric and text zero or one with stable ties while multi-bit data stays unsupported', () => {
  const rows = [
    { id: 'number-one', value: 1 },
    { id: 'text-zero', value: '0' },
    { id: 'number-zero', value: 0 },
    { id: 'text-one', value: '1' }
  ]
  for (const type of ['bit', 'BIT(1)', 'bit ( 1 )']) {
    const result = sortSqlResultRows(rows, { name: 'value', type }, 'ascending')
    assert.equal(result.kind, 'number')
    assert.equal(result.excludedCount, 0)
    assert.deepEqual(ids(result.rows), ['text-zero', 'number-zero', 'number-one', 'text-one'])
    assert.deepEqual(ids(sortSqlResultRows(rows, { name: 'value', type }, 'descending').rows), [
      'number-one',
      'text-one',
      'text-zero',
      'number-zero'
    ])
  }
  const multiBit = [
    { id: 'binary-ten', value: '00001010' },
    { id: 'binary-two', value: '00000010' }
  ]
  const result = sortSqlResultRows(multiBit, { name: 'value', type: 'bit(8)' }, 'ascending')
  assert.equal(result.kind, 'unsupported')
  assert.equal(result.excludedCount, 2)
  assert.deepEqual(ids(result.rows), ids(multiBit))
})

test('ISO date sorting validates Gregorian dates and excludes unsupported eras or infinity', () => {
  const rows = [
    { id: 'later', value: '2024-03-01' },
    { id: 'leap', value: '2024-02-29' },
    { id: 'invalid', value: '2023-02-29' },
    { id: 'bc', value: '0001-01-01 BC' },
    { id: 'infinity', value: 'infinity' },
    { id: 'early', value: '0100-01-01' }
  ]
  const result = sortSqlResultRows(rows, { name: 'value', type: 'date' }, 'ascending')
  assert.deepEqual(ids(result.rows), ['early', 'leap', 'later', 'invalid', 'bc', 'infinity'])
  assert.equal(result.excludedCount, 3)
  assert.match(result.message || '', /0100–9999/)
  assert.equal(
    sortSqlResultRows(rows.slice(0, 2), { name: 'value', type: 'date' }, 'ascending').message,
    undefined
  )
})

test('timezone timestamps compare instants, including equivalent offsets and submillisecond differences', () => {
  const rows = [
    { id: 'later-z', value: '2026-10-31T08:00:00Z' },
    { id: 'earlier-offset', value: '2026-10-31T10:00:00+03:00' },
    { id: 'equivalent-z', value: '2026-10-31T07:00:00Z' },
    { id: 'one-ns', value: '2026-10-31T07:00:00.000000001Z' },
    { id: 'one-ms', value: '2026-10-31T07:00:00.001Z' },
    { id: 'equivalent-compact', value: '2026-10-31 09:00:00+0200' },
    { id: 'equivalent-hours', value: '2026-10-31T09:00:00+02' }
  ]
  const column = { name: 'value', type: 'timestamptz' }
  const result = sortSqlResultRows(rows, column, 'ascending')
  assert.deepEqual(ids(result.rows), [
    'earlier-offset',
    'equivalent-z',
    'equivalent-compact',
    'equivalent-hours',
    'one-ns',
    'one-ms',
    'later-z'
  ])
  assert.equal(result.excludedCount, 0)
  assert.equal(result.message, undefined)
  assert.deepEqual(ids(sortSqlResultRows(rows, column, 'descending').rows), [
    'later-z',
    'one-ms',
    'one-ns',
    'earlier-offset',
    'equivalent-z',
    'equivalent-compact',
    'equivalent-hours'
  ])
})

test('naive timestamps use civil order at DST gaps and preserve all nine fractional digits', () => {
  const rows = [
    { id: 'later-fraction', value: '2026-03-08 02:30:00.123456789' },
    { id: 'earlier-fraction', value: '2026-03-08T02:30:00.123456788' },
    { id: 'before-gap', value: '2026-03-08T01:59:59.999999999' }
  ]
  const result = sortSqlResultRows(rows, { name: 'value', type: 'timestamp' }, 'ascending')
  assert.deepEqual(ids(result.rows), ['before-gap', 'earlier-fraction', 'later-fraction'])
  assert.equal(result.excludedCount, 0)
  assert.equal(result.message, undefined)
})

test('mixed temporal semantics, unknown offsets and invalid clock values are excluded without guessing', () => {
  const mixed = [
    { id: 'aware', value: '2026-10-31T00:00:00Z' },
    { id: 'null', value: null },
    { id: 'naive', value: '2026-10-30T00:00:00' },
    { id: 'invalid', value: '2026-10-31T24:00:00Z' }
  ]
  for (const direction of ['ascending', 'descending'] as const) {
    const result = sortSqlResultRows(mixed, { name: 'value', type: 'timestamp' }, direction)
    assert.deepEqual(ids(result.rows), ids(mixed))
    assert.equal(result.nullCount, 1)
    assert.equal(result.excludedCount, 3)
    assert.match(result.message || '', /混合了带时区与不带时区/)
  }
  const invalid = [
    '2026-10-31T00:00:00-00:00',
    '2026-10-31T00:00:60Z',
    '2026-10-31T00:00:00+14:01',
    '2026-10-31T00:00:00+02:60',
    '2026-10-31T00:00:00.1234567890Z',
    '2026-10-31 01:00:00 Europe/Paris'
  ].map((value, id) => ({ id, value }))
  const result = sortSqlResultRows(invalid, { name: 'value', type: 'datetime' }, 'descending')
  assert.deepEqual(ids(result.rows), ids(invalid))
  assert.equal(result.excludedCount, invalid.length)
})

test('time sorting retains nanoseconds and explicit offset order without modulo-day inference', () => {
  const aware = [
    { id: 'next-reference-day', value: '23:00:00-02:00' },
    { id: 'previous-reference-day', value: '00:00:00+02:00' },
    { id: 'zero', value: '00:00:00Z' },
    { id: 'equivalent-zero', value: '02:00:00+02:00' }
  ]
  const result = sortSqlResultRows(aware, { name: 'value', type: 'timetz' }, 'ascending')
  assert.deepEqual(ids(result.rows), [
    'previous-reference-day',
    'zero',
    'equivalent-zero',
    'next-reference-day'
  ])
  assert.match(result.message || '', /同一参考日/)
  assert.match(result.message || '', /不推断日期/)
  const naive = [
    { id: 'b', value: '12:00:00.000000002' },
    { id: 'a', value: '12:00:00.000000001' },
    { id: 'duration', value: '120:00:00' }
  ]
  const naiveResult = sortSqlResultRows(naive, { name: 'value', type: 'time' }, 'ascending')
  assert.deepEqual(ids(naiveResult.rows), ['a', 'b', 'duration'])
  assert.equal(naiveResult.excludedCount, 1)
})

test('exact-own reactive values and fake Vue flags do not become methods, booleans or unwrapped scalar data', () => {
  const reactiveRows = [
    reactive<Record<string, unknown>>({ id: 'two', hasOwnProperty: '2' }),
    reactive<Record<string, unknown>>({ id: 'one', hasOwnProperty: '1' })
  ]
  assert.equal(typeof reactiveRows[0].hasOwnProperty, 'function')
  assert.deepEqual(
    ids(
      sortSqlResultRows(reactiveRows, { ...numeric, property: 'hasOwnProperty' }, 'ascending').rows
    ),
    ['one', 'two']
  )
  const flagRows = [
    reactive<Record<string, unknown>>({ id: 'two', __v_isReactive: '2' }),
    reactive<Record<string, unknown>>({ id: 'one', __v_isReactive: '1' })
  ]
  assert.equal(flagRows[0].__v_isReactive, true)
  assert.deepEqual(
    ids(sortSqlResultRows(flagRows, { ...numeric, property: '__v_isReactive' }, 'ascending').rows),
    ['one', 'two']
  )
  const fake = reactive({ id: 'fake', value: { __v_isRef: true, value: '1', extra: 'keep' } })
  assert.equal(fake.value, '1')
  const real = { id: 'real', value: '2' }
  const result = sortSqlResultRows([fake, real], numeric, 'ascending')
  assert.deepEqual(ids(result.rows), ['real', 'fake'])
  assert.equal(result.excludedCount, 1)
})

test('only the selected own data field is read once per row and inherited or accessor fields stay NULL', () => {
  let selectedReads = 0
  const rows = ['2', '1'].map(
    (value, id) =>
      new Proxy(
        {
          id,
          alias: value,
          get unrelated() {
            assert.fail('another column must not be read')
          }
        },
        {
          getOwnPropertyDescriptor(target, key) {
            if (key === 'alias') selectedReads++
            return Reflect.getOwnPropertyDescriptor(target, key)
          }
        }
      )
  )
  const result = sortSqlResultRows(rows, { ...numeric, property: 'alias' }, 'ascending')
  assert.deepEqual(ids(result.rows), [1, 0])
  assert.equal(selectedReads, 2)
  const inherited: Record<string, unknown> = Object.create({
    get hasOwnProperty() {
      assert.fail('inherited field must not be read')
    }
  })
  const accessor = {
    get hasOwnProperty() {
      assert.fail('accessor field must not be read')
    }
  }
  const missing = sortSqlResultRows(
    [inherited, accessor, {}],
    { name: 'hasOwnProperty', type: 'numeric' },
    'ascending'
  )
  assert.equal(missing.nullCount, 3)
  assert.equal(missing.excludedCount, 0)
})

test('unsupported or entirely mistyped fields keep query order and never coerce user objects', () => {
  const object = {
    toString() {
      assert.fail('object coercion must not execute')
    }
  }
  const rows = [
    { id: 'first', value: object },
    { id: 'null', value: null },
    { id: 'array', value: [] },
    { id: 'missing' }
  ]
  for (const type of ['jsonb', 'integer[]', 'bytea', 'text', 'numeric']) {
    const result = sortSqlResultRows(rows, { name: 'value', type }, 'descending')
    assert.deepEqual(ids(result.rows), ids(rows))
    assert.equal(result.rows[0], rows[0])
    assert.equal(result.nullCount, 2)
    assert.equal(result.excludedCount, 2)
  }
  const empty = sortSqlResultRows([], numeric, 'ascending')
  assert.deepEqual(empty, { rows: [], kind: 'number', nullCount: 0, excludedCount: 0 })
})
