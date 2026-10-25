import assert from 'node:assert/strict'
import test from 'node:test'
import {
  newPayableSettlement,
  newPayableSettlementLine,
  settlementPaymentLabel,
  settlementStatusLabel,
  settlementTitles,
  validateSettlementAmounts
} from '../../src/utils/finance/payable-settlement'
import { financePaths } from '../../src/router/business-paths'

function refundLine() {
  return {
    ...newPayableSettlementLine(10),
    purposeId: 'refund-purpose',
    supplierId: 'supplier',
    payeeSupplierId: 'supplier',
    settlementMethodId: 'cash-method',
    fundAccountId: 'receiving-account',
    refundPaymentLineId: 'original-payment-line',
    amount: 90,
    approvedAmount: 90,
    plannedAmount: 90,
    expiredDiscountAmount: 10
  }
}

test('refund uses its own route, identity and receipt status without changing payment labels', () => {
  assert.equal(financePaths.payableRefund, '/fms/accounts-payable/payment-refund')
  assert.equal(settlementTitles.refund, '付款退款单')
  assert.equal(settlementStatusLabel('refund', 'confirmed'), '已确认到账')
  assert.equal(settlementStatusLabel('payment', 'confirmed'), '已确认付款')
  assert.equal(settlementPaymentLabel('refund', 'none'), '未到账')
  assert.equal(settlementPaymentLabel('refund', 'full'), '全部到账')
  assert.equal(settlementPaymentLabel('payment', 'full'), '全部付款')
  assert.equal(newPayableSettlement('refund').kind, 'refund')
})

test('refund requires an original payment and a receiving fund account', () => {
  assert.equal(validateSettlementAmounts([refundLine()], 'refund'), null)
  assert.match(
    validateSettlementAmounts([{ ...refundLine(), refundPaymentLineId: null }], 'refund') || '',
    /原付款/
  )
  assert.match(
    validateSettlementAmounts([{ ...refundLine(), fundAccountId: null }], 'refund') || '',
    /收款账户/
  )
})

test('expired discount remains separate from refundable cash and realized cash discount', () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY])
    assert.match(
      validateSettlementAmounts([{ ...refundLine(), expiredDiscountAmount: value }], 'refund') ||
        '',
      /失效折扣/
    )
  assert.match(
    validateSettlementAmounts([{ ...refundLine(), cashDiscount: 1 }], 'refund') || '',
    /现金折扣/
  )
  assert.equal(
    validateSettlementAmounts([{ ...refundLine(), expiredDiscountAmount: 0 }], 'refund'),
    null
  )
})
