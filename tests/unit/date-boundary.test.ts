import assert from 'node:assert/strict'
import test from 'node:test'
import { toDateStartTimestamp, toDateEndTimestamp } from '../../src/utils/time/date-boundary'

test('date filters preserve calendar dates without timezone conversion', () => {
  for (const date of ['2024-02-29', '2026-12-31', '2027-01-01']) {
    assert.equal(toDateStartTimestamp(date), `${date}T00:00:00`)
    assert.equal(toDateEndTimestamp(date), `${date}T23:59:59.999`)
    assert.equal(toDateStartTimestamp(date)?.includes('Z'), false)
    assert.equal(toDateEndTimestamp(date)?.includes('+'), false)
  }
})

test('unset date filters remain absent RPC parameters', () => {
  for (const date of [undefined, null, '']) {
    assert.equal(toDateStartTimestamp(date), null)
    assert.equal(toDateEndTimestamp(date), null)
  }
})
