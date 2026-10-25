import assert from 'node:assert/strict'
import test from 'node:test'
import { formatWithDayjs, isValidDateTimeValue } from '../../src/utils/time/format'
import { formatDateTimeValue } from '../../src/utils/ui/format'

test('time-only values accept clock boundaries and reject overflow instead of rolling into another day', () => {
  for (const value of ['00:00', '23:59', '00:00:00', '23:59:59']) {
    assert.equal(isValidDateTimeValue(value), true)
    assert.equal(isValidDateTimeValue(value, false), false)
    assert.equal(formatWithDayjs(value, value.length === 5 ? 'HH:mm' : 'HH:mm:ss'), value)
  }
  for (const value of ['24:00', '99:99', '12:60', '23:59:60', '99:99:99']) {
    assert.equal(isValidDateTimeValue(value), false, value)
    assert.equal(formatWithDayjs(value), value)
    assert.equal(formatDateTimeValue(value, { invalidText: '未识别' }), '未识别')
  }
})

test('time-only dates use today in the requested timezone across midnight and year boundaries', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-12-31T16:30:00Z') })
  assert.equal(formatWithDayjs('12:34', 'YYYY-MM-DD HH:mm', 'Asia/Shanghai'), '2027-01-01 12:34')
  assert.equal(
    formatWithDayjs('12:34', 'YYYY-MM-DD HH:mm', 'America/Los_Angeles'),
    '2026-12-31 12:34'
  )
  assert.equal(
    formatWithDayjs('12:34', 'YYYY-MM-DD HH:mm', 'Pacific/Kiritimati'),
    '2027-01-01 12:34'
  )
  assert.equal(formatWithDayjs('12:34', 'YYYY-MM-DD HH:mm', 'Pacific/Honolulu'), '2026-12-31 12:34')
})

test('full timestamps remain instants while invalid, masked and absent inputs preserve their fallback contract', () => {
  assert.equal(
    formatWithDayjs('2026-12-31T16:30:00Z', undefined, 'Asia/Shanghai'),
    '2027-01-01 00:30:00'
  )
  assert.equal(
    formatWithDayjs(new Date('2026-12-31T16:30:00Z'), undefined, 'America/Los_Angeles'),
    '2026-12-31 08:30:00'
  )
  for (const value of ['invalid', '***', '']) {
    assert.equal(formatWithDayjs(value), value)
    assert.equal(isValidDateTimeValue(value), false)
  }
  assert.equal(formatWithDayjs(null), null)
  assert.equal(formatWithDayjs(undefined), null)
  assert.equal(isValidDateTimeValue(new Date('invalid')), false)
  assert.equal(isValidDateTimeValue('2026-12-31T16:30:00Z', false), true)
})
