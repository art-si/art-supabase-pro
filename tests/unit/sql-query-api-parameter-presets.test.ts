import assert from 'node:assert/strict'
import test from 'node:test'
import { reactive } from 'vue'
import {
  normalizeQueryApiPresetName,
  normalizeQueryApiPresetValues,
  queryApiParameterSignature,
  readQueryApiPresetState,
  SqlQueryApiPresetError,
  writeQueryApiPresetState,
  type SqlQueryApiParameterPreset,
  type SqlQueryApiPresetState
} from '../../src/views/data-center/sql-console/modules/query-api-parameter-presets'
import type { SqlQueryApiParameter } from '../../src/types/sql-query-api'

const definitionId = '00000000-0000-4000-8000-000000000001'
const otherDefinitionId = '00000000-0000-4000-8000-000000000002'
const parameters: SqlQueryApiParameter[] = [
  { name: 'amount', type: 'number', required: true },
  { name: 'enabled', type: 'boolean', required: true },
  { name: 'note', type: 'string', required: false },
  { name: 'date', type: 'date', required: false },
  { name: 'owner', type: 'uuid', required: false }
]
const signature = queryApiParameterSignature(parameters)
const precise = '12345678901234567890.1234567890123456789'
const encoder = new TextEncoder()

function preset(overrides: Partial<SqlQueryApiParameterPreset> = {}): SqlQueryApiParameterPreset {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    name: '  默认参数  ',
    definitionId,
    definitionVersion: '2026-11-01 12:00:00.123456+00',
    parameterSignature: signature,
    updatedAt: '2026-11-01T12:00:00.000Z',
    values: { amount: precise, enabled: false, note: '  原始文本  ' },
    ...overrides
  }
}

function state(presets = [preset()]): SqlQueryApiPresetState {
  return { version: 1, presets }
}

function invalidRead(value: unknown, pattern?: RegExp): void {
  assert.throws(
    () => readQueryApiPresetState(JSON.stringify(value), definitionId),
    (error: unknown) =>
      error instanceof SqlQueryApiPresetError && (!pattern || pattern.test(error.message))
  )
}

test('parameter signatures ignore order but retain exact names, types and required settings', () => {
  const frozen = Object.freeze(parameters.map((parameter) => Object.freeze({ ...parameter })))
  assert.equal(queryApiParameterSignature([...frozen].reverse()), signature)
  for (const changes of [{ name: 'other' }, { type: 'string' as const }, { required: false }])
    assert.notEqual(
      queryApiParameterSignature([{ ...parameters[0], ...changes }, ...parameters.slice(1)]),
      signature
    )
  assert.deepEqual(JSON.parse(signature), [
    ['amount', 'number', true],
    ['date', 'date', false],
    ['enabled', 'boolean', true],
    ['note', 'string', false],
    ['owner', 'uuid', false]
  ])
  assert.equal(queryApiParameterSignature([]), '[]')
})

test('signatures reject duplicate or invalid parameter metadata without reading accessors', () => {
  assert.throws(
    () => queryApiParameterSignature([parameters[0], parameters[0]]),
    SqlQueryApiPresetError
  )
  assert.throws(
    () => queryApiParameterSignature([{ ...parameters[0], name: 'literal.dot' }]),
    SqlQueryApiPresetError
  )
  assert.throws(
    () =>
      queryApiParameterSignature(
        Array.from({ length: 21 }, (_, index) => ({
          name: `p${index}`,
          type: 'string',
          required: false
        }))
      ),
    SqlQueryApiPresetError
  )
  let calls = 0
  const accessor = { ...parameters[0] }
  Object.defineProperty(accessor, 'name', {
    get() {
      calls++
      return 'amount'
    }
  })
  assert.throws(() => queryApiParameterSignature([accessor]), SqlQueryApiPresetError)
  const inherited = Object.setPrototypeOf({ ...parameters[0] }, { hidden: 'value' })
  assert.throws(() => queryApiParameterSignature([inherited]), SqlQueryApiPresetError)
  assert.equal(calls, 0)
})

test('partial required values preserve decimal precision, false and raw string whitespace without mutation', () => {
  const input = Object.freeze({
    amount: ` ${precise} `,
    enabled: false,
    note: '   ',
    date: '',
    owner: undefined
  })
  assert.deepEqual(normalizeQueryApiPresetValues(parameters, input), {
    amount: precise,
    enabled: false,
    note: '   '
  })
  assert.deepEqual(normalizeQueryApiPresetValues(parameters, {}), {})
  assert.deepEqual(
    normalizeQueryApiPresetValues(parameters, { amount: null, enabled: undefined, note: '' }),
    {}
  )
  assert.equal(parameters[0].required, true)
  assert.equal(input.amount, ` ${precise} `)
})

test('reactive form DTOs preserve current own scalar values and return independent preset snapshots', () => {
  const definitions = reactive(parameters.map((parameter) => ({ ...parameter })))
  const values = reactive({ amount: precise, enabled: false, note: '  第一次  ' })
  const first = normalizeQueryApiPresetValues(definitions, values)
  values.note = '  第二次  '
  assert.equal(first.note, '  第一次  ')
  assert.equal(normalizeQueryApiPresetValues(definitions, values).note, '  第二次  ')
  assert.equal(queryApiParameterSignature(definitions), signature)
  const model = reactive(state([preset({ values: first })]))
  assert.deepEqual(
    readQueryApiPresetState(writeQueryApiPresetState(model, definitionId), definitionId).presets[0]
      .values,
    first
  )
})

test('filled values obey the existing typed call rules and never coerce objects or numeric scalars', () => {
  for (const value of [
    { amount: 'NaN' },
    { amount: '   ' },
    { amount: 1 },
    { amount: 1n },
    { enabled: 'false' },
    { date: '2026-02-30' },
    { owner: 'invalid' },
    { note: { value: 'text' } },
    { note: ['text'] },
    { extra: 'never-store-this' }
  ])
    assert.throws(() => normalizeQueryApiPresetValues(parameters, value), SqlQueryApiPresetError)
  assert.deepEqual(
    normalizeQueryApiPresetValues(parameters, {
      date: ' 2024-02-29 ',
      owner: ` ${definitionId.toUpperCase()} `
    }),
    { date: '2024-02-29', owner: definitionId.toUpperCase() }
  )
})

test('normalization rejects getters, custom prototypes and symbol fields without executing them', () => {
  let calls = 0
  const getter = Object.defineProperty({}, 'note', {
    enumerable: true,
    get() {
      calls++
      return 'text'
    }
  })
  assert.throws(() => normalizeQueryApiPresetValues(parameters, getter), SqlQueryApiPresetError)
  assert.throws(
    () => normalizeQueryApiPresetValues(parameters, Object.create({ note: 'inherited' })),
    SqlQueryApiPresetError
  )
  const symbol = { [Symbol('secret')]: 'value' }
  assert.throws(() => normalizeQueryApiPresetValues(parameters, symbol), SqlQueryApiPresetError)
  assert.equal(calls, 0)
})

test('preset names trim once and count UTF16 units, including exact emoji boundaries', () => {
  assert.equal(normalizeQueryApiPresetName('  工作日  '), '工作日')
  assert.equal(normalizeQueryApiPresetName('😀'.repeat(16)), '😀'.repeat(16))
  for (const value of ['', '   ', '😀'.repeat(17), 'x'.repeat(33), null, false, 'bad\0name'])
    assert.throws(() => normalizeQueryApiPresetName(value), SqlQueryApiPresetError)
})

test('read and write round-trip canonical metadata, precision and scalar values while keeping source frozen', () => {
  const input = preset()
  Object.freeze(input.values)
  Object.freeze(input)
  const original = state([input])
  Object.freeze(original.presets)
  Object.freeze(original)
  const raw = writeQueryApiPresetState(original, definitionId)
  const result = readQueryApiPresetState(raw, definitionId)
  assert.deepEqual(result, state([{ ...input, name: '默认参数' }]))
  assert.notEqual(result.presets, original.presets)
  assert.notEqual(result.presets[0].values, input.values)
  assert.equal(input.name, '  默认参数  ')
  assert.equal(result.presets[0].definitionVersion, input.definitionVersion)
  assert.deepEqual(readQueryApiPresetState('{"version":1,"presets":[]}', definitionId), state([]))
})

test('constructor, prototype and Vue-like parameter names remain literal own data across storage', () => {
  const definitions: SqlQueryApiParameter[] = [
    { name: 'constructor', type: 'string', required: true },
    { name: '__proto__', type: 'string', required: false },
    { name: '__v_raw', type: 'boolean', required: true }
  ]
  const values = Object.fromEntries([
    ['constructor', 'own'],
    ['__proto__', 'safe'],
    ['__v_raw', false]
  ])
  const source = state([
    preset({ parameterSignature: queryApiParameterSignature(definitions), values })
  ])
  const decoded = readQueryApiPresetState(
    writeQueryApiPresetState(source, definitionId),
    definitionId
  )
  assert.deepEqual(decoded.presets[0].values, values)
  assert.equal(Object.getPrototypeOf(decoded.presets[0].values), Object.prototype)
  assert.equal(
    Object.getOwnPropertyDescriptor(decoded.presets[0].values, '__proto__')?.value,
    'safe'
  )
})

test('limits enforce ten presets and reject duplicate IDs and trimmed names', () => {
  const entries = Array.from({ length: 10 }, (_, index) =>
    preset({
      id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
      name: `方案 ${index}`
    })
  )
  assert.equal(
    readQueryApiPresetState(writeQueryApiPresetState(state(entries), definitionId), definitionId)
      .presets.length,
    10
  )
  assert.throws(
    () => writeQueryApiPresetState(state([...entries, preset()]), definitionId),
    /最多保存 10/
  )
  invalidRead(state([preset({ name: 'A' }), preset({ name: 'B' })]), /编号重复/)
  invalidRead(
    state([preset({ name: ' A ' }), preset({ id: entries[1].id, name: 'A' })]),
    /名称重复/
  )
})

test('each string value has a 4000 UTF16-unit limit without truncation or precision conversion', () => {
  assert.equal(
    normalizeQueryApiPresetValues(parameters, { note: '😀'.repeat(2000) }).note.length,
    4000
  )
  assert.throws(
    () => normalizeQueryApiPresetValues(parameters, { note: '😀'.repeat(2001) }),
    /4000/
  )
  assert.throws(
    () =>
      writeQueryApiPresetState(
        state([preset({ values: { note: 'x'.repeat(4001) } })]),
        definitionId
      ),
    /4000/
  )
})

test('UTF8 store budget accepts exactly 64KiB and rejects one extra byte before parsing', () => {
  const definitions: SqlQueryApiParameter[] = Array.from({ length: 20 }, (_, index) => ({
    name: `p${index}`,
    type: 'string',
    required: false
  }))
  const values = Object.fromEntries(definitions.map(({ name }) => [name, 'x']))
  const source = state([
    preset({ parameterSignature: queryApiParameterSignature(definitions), values })
  ])
  let remaining = 65536 - encoder.encode(writeQueryApiPresetState(source, definitionId)).byteLength
  let expandable = ''
  for (const { name } of definitions) {
    const extra = Math.min(remaining, 3999)
    values[name] = 'x'.repeat(extra + 1)
    remaining -= extra
    if (extra < 3999) expandable = name
  }
  assert.equal(remaining, 0)
  const raw = writeQueryApiPresetState(source, definitionId)
  assert.equal(encoder.encode(raw).byteLength, 65536)
  assert.equal(readQueryApiPresetState(raw, definitionId).presets.length, 1)
  values[expandable] += 'x'
  assert.throws(() => writeQueryApiPresetState(source, definitionId), /64 KiB/)
  assert.throws(() => readQueryApiPresetState(`${raw} `, definitionId), /64 KiB/)
  assert.throws(() => readQueryApiPresetState('not-json'.repeat(10000), definitionId), /64 KiB/)
})

test('UTF8 multibyte values cannot bypass the byte budget with a shorter UTF16 string', () => {
  const definitions: SqlQueryApiParameter[] = Array.from({ length: 6 }, (_, index) => ({
    name: `p${index}`,
    type: 'string',
    required: false
  }))
  const source = state([
    preset({
      parameterSignature: queryApiParameterSignature(definitions),
      values: Object.fromEntries(definitions.map(({ name }) => [name, '中'.repeat(4000)]))
    })
  ])
  const raw = JSON.stringify(source)
  assert.ok(raw.length < 65536)
  assert.ok(encoder.encode(raw).byteLength > 65536)
  assert.throws(() => readQueryApiPresetState(raw, definitionId), /64 KiB/)
  assert.throws(() => writeQueryApiPresetState(source, definitionId), /64 KiB/)
})

test('malformed JSON, foreign definitions and invalid stored metadata fail with controlled Chinese errors', () => {
  for (const raw of ['', '{', 'null', '[]', 'false'])
    assert.throws(() => readQueryApiPresetState(raw, definitionId), SqlQueryApiPresetError)
  for (const override of [
    { id: 'bad' },
    { definitionId: otherDefinitionId },
    { definitionVersion: '' },
    { name: '   ' },
    { parameterSignature: '' },
    { parameterSignature: '[[]]' },
    { parameterSignature: JSON.stringify([['bad.name', 'string', false]]) },
    { parameterSignature: JSON.stringify([['amount', 'bogus', false]]) },
    {
      parameterSignature: JSON.stringify([
        ['note', 'string', false],
        ['amount', 'number', true]
      ])
    },
    { updatedAt: '2026-02-30T00:00:00.000Z' },
    { values: { note: { hidden: 'value' } } },
    { values: { note: null } },
    { values: { enabled: 'false' } },
    { values: { amount: 'NaN' } },
    { values: { hidden: 'value' } }
  ])
    invalidRead({ version: 1, presets: [{ ...preset(), ...override }] })
  invalidRead({ version: 2, presets: [] })
  invalidRead({ version: 1, presets: [], sql: 'must-never-be-stored' })
  invalidRead({ version: 1, presets: [{ ...preset(), token: 'must-never-be-stored' }] })
})

test('writer rejects accessor or inherited metadata and never executes toJSON hooks', () => {
  let calls = 0
  const inherited = Object.setPrototypeOf(preset(), { secret: 'never-store' })
  assert.throws(
    () => writeQueryApiPresetState(state([inherited]), definitionId),
    SqlQueryApiPresetError
  )
  const getter = preset()
  Object.defineProperty(getter, 'updatedAt', {
    get() {
      calls++
      return '2026-11-01T12:00:00.000Z'
    }
  })
  assert.throws(
    () => writeQueryApiPresetState(state([getter]), definitionId),
    SqlQueryApiPresetError
  )
  const hook = Object.assign(state(), {
    toJSON() {
      calls++
      return {}
    }
  })
  assert.throws(() => writeQueryApiPresetState(hook, definitionId), SqlQueryApiPresetError)
  const array = state()
  Object.defineProperty(array.presets, 'toJSON', {
    get() {
      calls++
      return () => []
    }
  })
  assert.throws(() => writeQueryApiPresetState(array, definitionId), SqlQueryApiPresetError)
  const arrayHook = state()
  Object.assign(arrayHook.presets, {
    toJSON() {
      calls++
      return []
    }
  })
  assert.throws(() => writeQueryApiPresetState(arrayHook, definitionId), SqlQueryApiPresetError)
  const missingScalar = state()
  Object.defineProperty(missingScalar.presets[0].values, 'note', {
    value: undefined,
    enumerable: false
  })
  assert.throws(() => writeQueryApiPresetState(missingScalar, definitionId), SqlQueryApiPresetError)
  assert.equal(calls, 0)
})
