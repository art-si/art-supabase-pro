import assert from 'node:assert/strict'
import test from 'node:test'
import {
  allowedPayableMatchOperators,
  newPayableMatchRule,
  validatePayableMatchRules,
  newPayableRelationConfig,
  payableSchemeApplies,
  payableSchemeRules,
  validatePayableRelationConfigs,
  isPayableWriteoffRelation
} from '../../src/utils/finance/payable-match'

test('new payable rule requires same counterparty and does not match empty fields', () => {
  assert.deepEqual(newPayableMatchRule(), {
    primaryField: 'supplier_id',
    secondaryField: 'supplier_id',
    operator: 'eq',
    emptyMatches: false
  })
})

test('relation matrix never falls back to common conditions for an unconfigured relation', () => {
  const payment = newPayableRelationConfig('payable_payment')
  const redBlue = {
    ...newPayableRelationConfig('payable_red_blue'),
    rules: [newPayableMatchRule('source_id')]
  }
  const scheme = {
    code: 'MATRIX',
    name: '按关系配置',
    enabled: true,
    rules: [newPayableMatchRule('amount')],
    relationRules: [payment, redBlue]
  }
  assert.equal(payableSchemeApplies(scheme, 'payment_refund'), false)
  assert.equal(payableSchemeRules(scheme, 'payment_refund'), undefined)
  assert.deepEqual(payableSchemeRules(scheme, 'payable_red_blue'), redBlue.rules)
  assert.deepEqual(payableSchemeRules(scheme, 'payable_payment'), payment.rules)
  assert.equal(validatePayableRelationConfigs(scheme.relationRules), '')
})

test('legacy common rules remain applicable and governed defaults use confirmed identity', () => {
  assert.equal(isPayableWriteoffRelation('payable_red_blue'), true)
  assert.equal(isPayableWriteoffRelation('unknown'), false)
  const rules = [newPayableMatchRule()]
  const legacy = { code: 'LEGACY', name: '共用', enabled: true, rules, relationRules: null }
  assert.equal(payableSchemeApplies(legacy, 'payable_receivable'), true)
  assert.deepEqual(payableSchemeRules(legacy, 'payable_receivable'), rules)
  assert.equal(
    newPayableRelationConfig('payable_receivable').rules[0].primaryField,
    'counterparty_id'
  )
  assert.match(validatePayableRelationConfigs([]), /1 至 5/)
  assert.match(
    validatePayableRelationConfigs([
      newPayableRelationConfig('payable_payment'),
      newPayableRelationConfig('payable_payment')
    ]),
    /只能配置一次/
  )
  assert.match(
    validatePayableRelationConfigs([{ relation: 'payable_payment', rules: [] }]),
    /第 1 种/
  )
})

test('supplier receipt refunds are independently configurable alongside all existing relations', () => {
  const relations = [
    'payable_payment',
    'payment_refund',
    'payable_receivable',
    'payable_red_blue',
    'payable_refund'
  ] as const
  const configs = relations.map((relation) => newPayableRelationConfig(relation))
  assert.equal(isPayableWriteoffRelation('payable_refund'), true)
  assert.equal(validatePayableRelationConfigs(configs), '')
  assert.match(validatePayableRelationConfigs([...configs, configs[0]]), /1 至 5/)
  const scheme = { code: 'REFUND', name: '退款核销', enabled: true, relationRules: [configs[4]] }
  assert.equal(payableSchemeApplies(scheme, 'payable_refund'), true)
  assert.equal(payableSchemeApplies(scheme, 'payment_refund'), false)
  assert.deepEqual(payableSchemeRules(scheme, 'payable_refund'), configs[4].rules)
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
