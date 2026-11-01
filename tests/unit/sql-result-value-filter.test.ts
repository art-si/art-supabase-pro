import assert from 'node:assert/strict'
import test from 'node:test'
import { reactive } from 'vue'
import {
  areSqlResultValueFiltersEqual,
  filterSqlResultValueRows,
  formatSqlResultFilterValue,
  readSqlResultFilterValue,
  type SqlResultFilterValue,
  type SqlResultValueFilter
} from '../../src/views/data-center/sql-console/modules/result-value-filter'

const condition = (
  value: SqlResultFilterValue,
  operator: SqlResultValueFilter['operator'] = 'include',
  field = 'value',
  id = 'condition'
): SqlResultValueFilter => ({ id, field, operator, value })

test('selected scalar values preserve their exact types, numeric precision, whitespace, and signed zero', () => {
  const values: SqlResultFilterValue[] = [
    null,
    '',
    ' ',
    '\t\n',
    'NULL',
    true,
    false,
    0,
    -0,
    0.1,
    Number.MIN_VALUE,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,
    9223372036854775807n,
    '9223372036854775807',
    '0.1234567890123456789012345678900001'
  ]
  for (const value of values) {
    const result = readSqlResultFilterValue({ value }, 'value')
    assert.equal(result.supported, true)
    if (result.supported) assert.ok(Object.is(result.value, value))
  }
})

test('unsupported selected values explain why, without coercing or serializing complex values', () => {
  const object = {
    toString() {
      assert.fail('object coercion must not execute')
    },
    toJSON() {
      assert.fail('object serialization must not execute')
    }
  }
  const cases: [unknown, RegExp][] = [
    [undefined, /undefined/],
    [NaN, /非有限/],
    [Infinity, /非有限/],
    [-Infinity, /非有限/],
    [Number.MAX_SAFE_INTEGER + 1, /安全精度/],
    [Number.MIN_SAFE_INTEGER - 1, /安全精度/],
    [object, /JSON 对象.*复杂值/],
    [[], /数组.*复杂值/],
    [new Date(), /复杂值/],
    [() => undefined, /函数/],
    [Symbol('value'), /Symbol/]
  ]
  for (const [value, expected] of cases) {
    const result = readSqlResultFilterValue({ value }, 'value')
    assert.equal(result.supported, false)
    if (!result.supported) assert.match(result.reason, expected)
  }
})

test('missing, own undefined, and accessors have distinct reasons and getters never execute', () => {
  const inherited: object = Object.create({
    get value() {
      assert.fail('inherited getter must not execute')
    }
  })
  const accessor = {
    get value() {
      assert.fail('own getter must not execute')
    }
  }
  for (const [row, expected] of [
    [{}, /缺少/],
    [inherited, /缺少/],
    [{ value: undefined }, /undefined/],
    [accessor, /访问器/]
  ] as const) {
    const result = readSqlResultFilterValue(row, 'value')
    assert.equal(result.supported, false)
    if (!result.supported) assert.match(result.reason, expected)
  }
  assert.deepEqual(filterSqlResultValueRows([inherited, accessor], [condition(null)]), [])
  assert.deepEqual(filterSqlResultValueRows([inherited, accessor], [condition(null, 'exclude')]), [
    inherited,
    accessor
  ])
})

test('literal dotted, prototype, reserved Vue, and children keys use exact own data fields', () => {
  const raw = Object.defineProperty(
    {
      'nested.value': 'literal',
      nested: { value: 'nested' },
      hasOwnProperty: 'own-method-name',
      __v_isReactive: 'own-vue-flag',
      children: 'scalar-children'
    },
    '__proto__',
    { value: 'own-prototype-name', enumerable: true }
  )
  const row = reactive(raw)
  assert.equal(row.__v_isReactive, true)
  assert.equal(typeof row.hasOwnProperty, 'function')
  for (const [field, value] of [
    ['nested.value', 'literal'],
    ['__proto__', 'own-prototype-name'],
    ['hasOwnProperty', 'own-method-name'],
    ['__v_isReactive', 'own-vue-flag'],
    ['children', 'scalar-children']
  ]) {
    assert.deepEqual(readSqlResultFilterValue(row, field), { supported: true, value })
    assert.deepEqual(filterSqlResultValueRows([row, {}], [condition(value, 'include', field)]), [
      row
    ])
  }
  const fakeRef = reactive({ value: { __v_isRef: true, value: 'unwrapped', keep: true } })
  assert.equal(fakeRef.value, 'unwrapped')
  const result = readSqlResultFilterValue(fakeRef, 'value')
  assert.equal(result.supported, false)
  if (!result.supported) assert.match(result.reason, /复杂值/)
})

test('strict inclusion and exclusion never coerce numeric text, BigInt, booleans, or signed zero', () => {
  const preciseA = '0.1234567890123456789012345678900001'
  const preciseB = '0.1234567890123456789012345678900002'
  const rows = [
    { value: '1' },
    { value: '1.0' },
    { value: 1 },
    { value: 1n },
    { value: true },
    { value: false },
    { value: 0 },
    { value: -0 },
    { value: preciseA },
    { value: preciseB },
    { value: 9223372036854775807n },
    { value: 9223372036854775806n },
    { value: '9223372036854775807' }
  ]
  for (const selected of rows) {
    assert.deepEqual(filterSqlResultValueRows(rows, [condition(selected.value)]), [selected])
    assert.deepEqual(
      filterSqlResultValueRows(rows, [condition(selected.value, 'exclude')]),
      rows.filter((row) => row !== selected)
    )
  }
})

test('NULL, empty text, whitespace, literal NULL, and missing values keep separate raw identities', () => {
  const rows = [
    { value: null },
    { value: '' },
    { value: ' ' },
    { value: '\t' },
    { value: 'NULL' },
    { value: undefined },
    {}
  ]
  for (const value of [null, '', ' ', '\t', 'NULL']) {
    const included = rows.filter((row) => Object.is(row.value, value))
    assert.deepEqual(filterSqlResultValueRows(rows, [condition(value)]), included)
    assert.deepEqual(
      filterSqlResultValueRows(rows, [condition(value, 'exclude')]),
      rows.filter((row) => !included.includes(row))
    )
  }
  assert.deepEqual(filterSqlResultValueRows(rows, [condition(null, 'exclude')]), rows.slice(1))
})

test('multiple fields and same-field conditions combine with AND; duplicates do not replace contradictions', () => {
  const rows = [
    { value: 'A', status: 'open' },
    { value: 'A', status: 'closed' },
    { value: 'B', status: 'open' }
  ]
  const first = condition('A')
  const duplicate = { ...first, id: 'duplicate' }
  const excluded = condition('closed', 'exclude', 'status')
  const filters = Object.freeze([Object.freeze(first), Object.freeze(duplicate), excluded])
  assert.deepEqual(filterSqlResultValueRows(rows, filters), [rows[0]])
  assert.equal(areSqlResultValueFiltersEqual(first, duplicate), true)
  assert.deepEqual(filterSqlResultValueRows(rows, [...filters, condition('B')]), [])
  assert.deepEqual(filterSqlResultValueRows(rows, [first, condition('A', 'exclude')]), [])
  assert.equal(filters.length, 3)
})

test('condition equality ignores only id while preserving field, operator, type, and signed zero', () => {
  const first = condition('1')
  assert.equal(areSqlResultValueFiltersEqual(first, { ...first, id: 'another' }), true)
  for (const other of [
    condition('1', 'include', 'another-field'),
    condition('1', 'exclude'),
    condition(1),
    condition(1n),
    condition(true)
  ])
    assert.equal(areSqlResultValueFiltersEqual(first, other), false)
  assert.equal(areSqlResultValueFiltersEqual(condition(0), condition(-0)), false)
  assert.equal(areSqlResultValueFiltersEqual(condition(null), condition('NULL')), false)
})

test('long summaries do not change full-value matching, row order, references, or source data', () => {
  const prefix = 'text'.repeat(262144)
  const firstValue = `${prefix}A`
  const secondValue = `${prefix}B`
  const rows = Object.freeze([
    Object.freeze({ id: 1, value: firstValue }),
    Object.freeze({ id: 2, value: secondValue }),
    Object.freeze({ id: 3, value: firstValue })
  ])
  assert.equal(formatSqlResultFilterValue(firstValue), formatSqlResultFilterValue(secondValue))
  const filters = Object.freeze([Object.freeze(condition(firstValue))])
  const filtered = filterSqlResultValueRows(rows, filters)
  assert.deepEqual(filtered, [rows[0], rows[2]])
  assert.equal(filtered[0], rows[0])
  assert.equal(filtered[1], rows[2])
  assert.equal(filters[0].value, firstValue)
  assert.equal(rows[1].value, secondValue)
  const unfiltered = filterSqlResultValueRows(rows, [])
  assert.notEqual(unfiltered, rows)
  assert.deepEqual(unfiltered, rows)
  assert.equal(unfiltered[0], rows[0])
})

test('bounded value summaries preserve JSON quotes, whitespace, escapes, BigInt type, and signed zero', () => {
  assert.equal(formatSqlResultFilterValue(null), 'NULL')
  assert.equal(formatSqlResultFilterValue('NULL'), '"NULL"')
  assert.equal(formatSqlResultFilterValue(''), '""')
  assert.equal(formatSqlResultFilterValue('  '), '"  "')
  assert.equal(
    formatSqlResultFilterValue('\0\t\r\n\b\f\u001f"\\'),
    '"\\u0000\\t\\r\\n\\b\\f\\u001f\\"\\\\"'
  )
  assert.equal(formatSqlResultFilterValue(true), 'true')
  assert.equal(formatSqlResultFilterValue(123n), '123n')
  assert.equal(formatSqlResultFilterValue(-0), '-0')
  assert.equal(formatSqlResultFilterValue(0), '0')
  for (const value of ['a'.repeat(1000), '\0'.repeat(1000), '😀'.repeat(1000), 10n ** 1000n]) {
    const summary = formatSqlResultFilterValue(value)
    assert.ok(summary.length <= 160)
    assert.ok(summary.includes('…'))
    if (typeof value === 'bigint') assert.ok(summary.endsWith('n'))
  }
})

test('Unicode summaries never split valid surrogate pairs or JSON escapes, including boundary cases', () => {
  const cases = [
    'a'.repeat(156) + '😀tail',
    'a'.repeat(157) + '😀tail',
    '😀'.repeat(79),
    '😀'.repeat(80),
    '\ud800',
    '\udc00',
    '\0'.repeat(25) + '😀tail',
    '组合 e\u0301\u2028\u2029'
  ]
  for (const value of cases) {
    const summary = formatSqlResultFilterValue(value)
    assert.ok(summary.length <= 160)
    const json = summary.endsWith('…') ? summary.slice(0, -1) : summary
    const decoded: unknown = JSON.parse(json)
    assert.equal(typeof decoded, 'string')
    if (typeof decoded === 'string') {
      assert.ok(value.startsWith(decoded))
      if (value.isWellFormed()) assert.ok(decoded.isWellFormed())
      if (!summary.endsWith('…')) assert.equal(decoded, value)
    }
  }
})
