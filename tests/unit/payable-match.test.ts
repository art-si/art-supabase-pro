import assert from 'node:assert/strict'
import test from 'node:test'
import {
  allowedPayableMatchOperators,
  newPayableMatchRule,
  validatePayableMatchRules
} from '../../src/utils/finance/payable-match'

test('new payable rule requires same counterparty and does not match empty fields', () => {
  assert.deepEqual(newPayableMatchRule(), {
    primaryField: 'supplier_id',
    secondaryField: 'supplier_id',
    operator: 'eq',
    emptyMatches: false
  })
})

test('different text fields can match and date fields have ordering operators', () => {
  const source = {
    ...newPayableMatchRule('document_no'),
    secondaryField: 'source_document_no' as const
  }
  assert.deepEqual(allowedPayableMatchOperators(source), ['eq', 'ne', 'contains', 'starts_with'])
  assert.equal(validatePayableMatchRules([source]), '')
  assert.ok(allowedPayableMatchOperators(newPayableMatchRule('business_date')).includes('lte'))
  assert.ok(allowedPayableMatchOperators(newPayableMatchRule('amount')).includes('gt'))
})

test('governed counterparty identities use reference equality rather than name matching', () => {
  const rule = newPayableMatchRule('counterparty_id')
  assert.equal(validatePayableMatchRules([rule]), '')
  assert.deepEqual(allowedPayableMatchOperators(rule), ['eq', 'ne'])
  assert.match(validatePayableMatchRules([{ ...rule, operator: 'contains' }]), /不兼容/)
})

test('incompatible types, reference ordering, empty and oversized rules fail validation', () => {
  assert.match(
    validatePayableMatchRules([
      { ...newPayableMatchRule('business_date'), secondaryField: 'amount' }
    ]),
    /第 1 条/
  )
  assert.match(
    validatePayableMatchRules([{ ...newPayableMatchRule(), operator: 'contains' }]),
    /不兼容/
  )
  assert.match(validatePayableMatchRules([]), /1 至 20/)
  assert.match(
    validatePayableMatchRules(Array.from({ length: 21 }, () => newPayableMatchRule())),
    /20/
  )
})
