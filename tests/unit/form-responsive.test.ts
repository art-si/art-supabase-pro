import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateActionSpan, calculateResponsiveSpan } from '../../src/utils/form/responsive'

test('mixed-width fields leave action space based on actual wrapped rows', () => {
  assert.equal(calculateActionSpan([12, 6, 12]), 12)
  assert.equal(calculateActionSpan([12, 6, 12, 6, 6, 12, 12]), 24)
})

test('empty, complete and uniform rows preserve action layout', () => {
  assert.equal(calculateActionSpan([]), 24)
  assert.equal(calculateActionSpan([24]), 24)
  assert.equal(calculateActionSpan([6, 6, 6]), 6)
  assert.equal(calculateActionSpan([6, 6, 6, 6]), 24)
})

test('responsive field widths determine available action space', () => {
  const spans = [12, 6, 12]
  assert.equal(calculateActionSpan(spans.map((span) => calculateResponsiveSpan(span, 6, 'xs'))), 24)
  assert.equal(calculateActionSpan(spans.map((span) => calculateResponsiveSpan(span, 6, 'sm'))), 12)
  assert.equal(calculateActionSpan(spans.map((span) => calculateResponsiveSpan(span, 6, 'md'))), 12)
})
