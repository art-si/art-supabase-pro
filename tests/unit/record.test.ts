import assert from 'node:assert/strict'
import test from 'node:test'
import { isObjectRecord, toObjectRecord } from '../../src/utils/record'

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
