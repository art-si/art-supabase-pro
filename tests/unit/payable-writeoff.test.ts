import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  allocateWriteoffAmounts,
  preferredPayableWriteoffScheme,
  allocatePayableRedBlueAmounts,
  formatPayableCurrencyTotals,
  formatPayableExchangeDifference
} from '../../src/utils/finance/payable-writeoff'
import type { PayableReference } from '../../src/api/payable-reference'
import {
  newPayableSettlementLine,
  validateSettlementAmounts,
  payablePurposeBusinessTypeOptions
} from '../../src/utils/finance/payable-settlement'

describe('payable writeoff allocation', () => {
  it('keeps default schemes aligned with relation and selected tenant', () => {
    const schemes: PayableReference[] = [
      { id: 'ar', tenantId: 'one', code: 'AP-AR-MANUAL', name: '应付冲应收', enabled: true },
      { id: 'legacy', tenantId: 'one', code: 'AP-MANUAL', name: '付款核销', enabled: true },
      {
        id: 'automatic',
        tenantId: 'two',
        code: 'AP-AR-AUTO',
        name: '自动方案',
        enabled: true,
        automatic: true
      },
      { id: 'disabled', tenantId: 'two', code: 'AP-MANUAL', name: '停用方案', enabled: false }
    ]
    assert.equal(preferredPayableWriteoffScheme(schemes, 'payable_payment', 'one'), 'legacy')
    assert.equal(preferredPayableWriteoffScheme(schemes, 'payment_refund', 'one'), 'legacy')
    assert.equal(preferredPayableWriteoffScheme(schemes, 'payable_receivable', 'one'), 'ar')
    assert.equal(preferredPayableWriteoffScheme(schemes, 'payable_red_blue', 'one'), 'legacy')
    assert.equal(preferredPayableWriteoffScheme(schemes, 'payable_receivable', 'two'), '')
    assert.deepEqual(
      schemes.map((scheme) => scheme.id),
      ['ar', 'legacy', 'automatic', 'disabled']
    )
  })
  it('keeps payment and symmetric refund business types distinct', () => {
    const labels = Object.fromEntries(
      payablePurposeBusinessTypeOptions.map(({ value, label }) => [value, label])
    )
    assert.equal(Object.keys(labels).length, payablePurposeBusinessTypeOptions.length)
    assert.equal(labels.purchase, '采购付款')
    assert.equal(labels.purchase_refund, '退采购付款')
    assert.equal(labels.advance_refund, '退预付款')
    assert.equal(labels.other_refund, '其他退款')
  })
  it('splits multiple sides exactly in cents without mutating inputs', () => {
    const primary = [
      { id: 'ap1', availableAmount: 0.1 },
      { id: 'ap2', availableAmount: 0.2 }
    ]
    const secondary = [
      { id: 'pay1', availableAmount: 0.15 },
      { id: 'pay2', availableAmount: 0.15 }
    ]
    assert.deepEqual(allocateWriteoffAmounts(primary, secondary), [
      { primaryId: 'ap1', secondaryId: 'pay1', amount: 0.1 },
      { primaryId: 'ap2', secondaryId: 'pay1', amount: 0.05 },
      { primaryId: 'ap2', secondaryId: 'pay2', amount: 0.15 }
    ])
    assert.equal(primary[0].availableAmount, 0.1)
  })
  it('rejects missing sides, excess, invalid amounts and unequal totals', () => {
    assert.throws(() => allocateWriteoffAmounts([], []), /分别选择/)
    assert.throws(
      () =>
        allocateWriteoffAmounts(
          [{ id: 'ap', availableAmount: 100, writeoffAmount: 101 }],
          [{ id: 'pay', availableAmount: 101 }]
        ),
      /不能超过/
    )
    assert.throws(
      () =>
        allocateWriteoffAmounts(
          [{ id: 'ap', availableAmount: 100, writeoffAmount: NaN }],
          [{ id: 'pay', availableAmount: 100 }]
        ),
      /本次核销金额/
    )
    assert.throws(
      () =>
        allocateWriteoffAmounts(
          [{ id: 'ap', availableAmount: 100 }],
          [{ id: 'pay', availableAmount: 99.99 }]
        ),
      /合计须一致/
    )
  })
  it('validates multi-party settlement details and approval limits', () => {
    const line = {
      ...newPayableSettlementLine(10),
      purposeId: 'purpose',
      supplierId: 'supplier',
      payeeSupplierId: 'supplier',
      settlementMethodId: 'method',
      amount: 100,
      approvedAmount: 90,
      plannedAmount: 80
    }
    assert.equal(validateSettlementAmounts([line]), null)
    assert.match(validateSettlementAmounts([{ ...line, approvedAmount: 101 }]) || '', /金额不正确/)
    assert.match(validateSettlementAmounts([{ ...line, supplierId: null }]) || '', /往来单位/)
  })
  it('keeps red/blue allocation within each book and currency, while explicit foreign pairs retain both original amounts', () => {
    assert.deepEqual(
      allocatePayableRedBlueAmounts(
        [
          { id: 'blue-cny', currencyCode: 'CNY', accountSetId: 'one', availableAmount: 50 },
          { id: 'blue-usd', currencyCode: 'USD', accountSetId: 'one', availableAmount: 100 }
        ],
        [
          { id: 'credit-usd', currencyCode: 'USD', accountSetId: 'one', availableAmount: 100 },
          { id: 'credit-cny', currencyCode: 'CNY', accountSetId: 'one', availableAmount: 50 }
        ]
      ),
      [
        { primaryId: 'blue-cny', secondaryId: 'credit-cny', amount: 50, creditAmount: 50 },
        { primaryId: 'blue-usd', secondaryId: 'credit-usd', amount: 100, creditAmount: 100 }
      ]
    )
    assert.deepEqual(
      allocatePayableRedBlueAmounts(
        [{ id: 'blue', currencyCode: 'USD', accountSetId: 'one', availableAmount: 100 }],
        [{ id: 'credit', currencyCode: 'EUR', accountSetId: 'one', availableAmount: 90 }]
      ),
      [{ primaryId: 'blue', secondaryId: 'credit', amount: 100, creditAmount: 90 }]
    )
    assert.throws(
      () =>
        allocatePayableRedBlueAmounts(
          [{ id: 'blue', currencyCode: 'CNY', accountSetId: 'one', availableAmount: 100 }],
          [{ id: 'credit', currencyCode: 'CNY', accountSetId: 'two', availableAmount: 100 }]
        ),
      /跨账套/
    )
    assert.throws(
      () =>
        allocatePayableRedBlueAmounts(
          [{ id: 'blue', currencyCode: 'CNY', availableAmount: 100, writeoffAmount: 0.001 }],
          [{ id: 'credit', currencyCode: 'USD', availableAmount: 100 }]
        ),
      /两位小数/
    )
  })
  it('never adds different currencies into a misleading yuan total and keeps the FX sign explicit', () => {
    const value = formatPayableCurrencyTotals(
      [
        { currencyCode: 'CNY', amount: 100 },
        { currencyCode: 'USD', amount: 100 }
      ],
      (row) => row.amount
    )
    assert.match(value, /¥100\.00/)
    assert.match(value, /USD/)
    assert.doesNotMatch(value, /¥200/)
    assert.match(formatPayableExchangeDifference(10), /收益.*10\.00/)
    assert.match(formatPayableExchangeDifference(-10), /损失.*10\.00/)
    assert.equal(formatPayableExchangeDifference(0), '—')
  })
})
