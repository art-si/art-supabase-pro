import assert from 'node:assert/strict'
import test from 'node:test'
import { effect, reactive, ref, stop } from 'vue'
import { get } from 'lodash-es'
import { getOwnRecordValue, isObjectRecord, toObjectRecord } from '../../src/utils/record'

test('record boundaries reject null, arrays, functions and primitives without changing valid object identity', () => {
  for (const value of [null, undefined, [], () => true, '', 1, false]) {
    assert.equal(isObjectRecord(value), false)
    assert.deepEqual(toObjectRecord(value), {})
  }
  const record = { code: 'example' }
  assert.equal(isObjectRecord(record), true)
  assert.equal(toObjectRecord(record), record)
})

test('record boundaries preserve null-prototype objects and their own keys', () => {
  const record = Object.create(null)
  record.__proto__ = 'a database column'
  assert.equal(isObjectRecord(record), true)
  assert.equal(toObjectRecord(record), record)
  assert.equal(toObjectRecord(record).__proto__, 'a database column')
})

test('exact-own DTO reads distinguish data from inherited names and never invoke accessors', () => {
  let getterCalls = 0
  const record = Object.defineProperty({ own: undefined, nullable: null }, 'accessor', {
    enumerable: true,
    get: () => {
      getterCalls++
      return 'must not execute'
    }
  })
  for (const key of ['toString', '__proto__', 'constructor', 'missing', 'accessor'])
    assert.equal(getOwnRecordValue(record, key), undefined)
  assert.equal(getOwnRecordValue(record, 'own'), undefined)
  assert.equal(getOwnRecordValue(record, 'nullable'), null)
  assert.equal(getterCalls, 0)
  const ownNames = Object.fromEntries([
    ['__proto__', 'literal prototype'],
    ['constructor', 'literal constructor'],
    ['hasOwnProperty', 'literal method']
  ])
  for (const [key, value] of Object.entries(ownNames))
    assert.equal(getOwnRecordValue(ownNames, key), value)
})

test('exact-own reads track top-level SET, DELETE and ADD without reading Vue reserved getters', () => {
  const record = reactive<Record<string, unknown>>({ hasOwnProperty: 'initial' })
  const seen: unknown[] = []
  const runner = effect(() => seen.push(getOwnRecordValue(record, 'hasOwnProperty')))
  record.hasOwnProperty = 'changed'
  delete record.hasOwnProperty
  record.hasOwnProperty = 'restored'
  stop(runner)
  assert.deepEqual(seen, ['initial', 'changed', undefined, 'restored'])
  assert.equal(typeof record.hasOwnProperty, 'function')
})

test('DTO Vue-like flags remain literal values without proxy or Ref detection', () => {
  const keys = ['__v_raw', '__v_isRef', '__v_isReactive', '__v_isReadonly', '__v_skip']
  const record = Object.fromEntries(keys.map((key) => [key, `${key} data`]))
  for (const key of keys) assert.equal(getOwnRecordValue(record, key), `${key} data`)
  const undefinedFields = reactive(Object.fromEntries(keys.map((key) => [key, undefined])))
  for (const key of keys) assert.equal(getOwnRecordValue(undefinedFields, key), undefined)
  const fakeRef = { __v_isRef: true, value: 'real value', extra: 'preserved' }
  assert.equal(getOwnRecordValue({ payload: fakeRef }, 'payload'), fakeRef)
})

test('DTO reads preserve exact values while generic nested paths, arrays and Ref reactivity remain unchanged', () => {
  const nested = { value: 'first' }
  const cellRef = ref('ref-first')
  const record = reactive({ nested, list: [{ value: 'array-first' }], cellRef })
  assert.equal(getOwnRecordValue(record, 'nested'), nested)
  assert.equal(getOwnRecordValue(record, 'cellRef'), cellRef)
  const seen: unknown[] = []
  const runner = effect(() =>
    seen.push([get(record, 'nested.value'), get(record, 'list[0].value'), get(record, 'cellRef')])
  )
  record.nested.value = 'second'
  record.list[0].value = 'array-second'
  cellRef.value = 'ref-second'
  stop(runner)
  assert.deepEqual(seen, [
    ['first', 'array-first', 'ref-first'],
    ['second', 'array-first', 'ref-first'],
    ['second', 'array-second', 'ref-first'],
    ['second', 'array-second', 'ref-second']
  ])
})
