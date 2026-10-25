import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isOcrRecord,
  normalizeOcrConfidence,
  normalizeOcrDate,
  normalizeOcrDateTime,
  normalizeOcrNonNegativeNumber,
  normalizeOcrStringArray,
  normalizeOcrTextValue
} from '../../supabase/functions/_shared/ai-ocr-values'

test('normalizes OCR text and bounded string collections', () => {
  assert.equal(normalizeOcrTextValue('  发票号码  ', 4), '发票号码')
  assert.equal(normalizeOcrTextValue('   '), null)
  assert.equal(normalizeOcrTextValue(123), null)
  assert.deepEqual(normalizeOcrStringArray([' A ', '', 2, 'B', 'C'], 2), ['A', 'B'])
})

test('normalizes non-negative OCR numbers and confidence', () => {
  assert.equal(normalizeOcrNonNegativeNumber(0), 0)
  assert.equal(normalizeOcrNonNegativeNumber('12.50'), 12.5)
  assert.equal(normalizeOcrNonNegativeNumber(-1), null)
  assert.equal(normalizeOcrNonNegativeNumber('not-a-number'), null)
  assert.equal(normalizeOcrConfidence(-0.2), 0)
  assert.equal(normalizeOcrConfidence(1.2), 1)
  assert.equal(normalizeOcrConfidence('0.8'), 0.8)
})

test('accepts valid OCR records and calendar values only', () => {
  assert.equal(isOcrRecord({ value: 1 }), true)
  assert.equal(isOcrRecord([]), false)
  assert.equal(normalizeOcrDate('2024年2月29日'), '2024-02-29')
  assert.equal(normalizeOcrDate('2023-02-29'), null)
  assert.equal(normalizeOcrDateTime('2026-09-10T08:30:00+08:00'), '2026-09-10T00:30:00.000Z')
  assert.equal(normalizeOcrDateTime('invalid'), null)
})
