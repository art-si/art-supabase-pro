import assert from 'node:assert/strict'
import test from 'node:test'
import { formatCoordinateValue } from '../../src/utils/ui/coordinates'
import { normalizeCoordinatePair } from '../../src/utils/geo'

test('coordinate parsing preserves zero and range boundaries', () => {
  assert.deepEqual(normalizeCoordinatePair('0', 0), { longitude: 0, latitude: 0 })
  assert.deepEqual(normalizeCoordinatePair('180', '-90'), { longitude: 180, latitude: -90 })
  assert.deepEqual(normalizeCoordinatePair(-180, 90), { longitude: -180, latitude: 90 })
})

test('coordinate parsing rejects incomplete, invalid, protected and out-of-range values', () => {
  for (const value of [null, undefined, '', ' ', 'invalid', '***', NaN, Infinity, true, {}, []]) {
    assert.equal(normalizeCoordinatePair(value, 30), null)
    assert.equal(normalizeCoordinatePair(120, value), null)
  }
  for (const value of [-180.1, 180.1]) assert.equal(normalizeCoordinatePair(value, 30), null)
  for (const value of [-90.1, 90.1]) assert.equal(normalizeCoordinatePair(120, value), null)
})

test('coordinate display preserves real zero and caller precision', () => {
  assert.equal(formatCoordinateValue(0, 0), '0, 0')
  assert.equal(
    formatCoordinateValue('120.123456789', '30.123456789', { fractionDigits: 6 }),
    '120.123457, 30.123457'
  )
  assert.equal(formatCoordinateValue(0, 0, { fractionDigits: 7 }), '0.0000000, 0.0000000')
  assert.equal(formatCoordinateValue(180, -90), '180, -90')
})
test('coordinate display rejects missing, invalid and out-of-range pairs', () => {
  for (const value of [null, undefined, '', '  ', 'invalid', NaN, Infinity, 181])
    assert.equal(formatCoordinateValue(value, 30), '--')
  assert.equal(formatCoordinateValue(120, 91), '--')
  assert.equal(formatCoordinateValue(0, null, { emptyText: '未定位' }), '未定位')
})
test('masked coordinates conceal the entire pair', () => {
  assert.equal(formatCoordinateValue('***', 30), '***')
  assert.equal(formatCoordinateValue(120, ' *** '), '***')
  assert.equal(formatCoordinateValue(null, '***'), '***')
})
