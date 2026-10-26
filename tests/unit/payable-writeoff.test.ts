import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  allocateWriteoffAmounts,
  preferredPayableWriteoffScheme,
  allocatePayableBookAmounts,
  formatPayableCurrencyTotals,
  formatPayableExchangeDifference,
  payableWriteoffMoneyFields,
  payableWriteoffMoneyValues,
  payableWriteoffUsesBookAmounts,
  restoreWriteoffSelection,
  payableWriteoffSourceTitles
} from '../../src/utils/finance/payable-writeoff'
import type { PayableReference } from '../../src/api/payable-reference'
import {
  newPayableSettlementLine,
  validateSettlementAmounts,
  payablePurposeBusinessTypeOptions
} from '../../src/utils/finance/payable-settlement'

describe('payable writeoff allocation', () => {
  it('restores amounts only when the same source financial snapshot remains unchanged', () => {
    const original = {
      id: 'invoice',
      availableAmount: 100,
      writeoffAmount: 40,
      accountSetId: 'book',
      currencyCode: 'USD',
      matchValues: { executionId: 'first' }
    }
    const current = { ...original, writeoffAmount: 100 }
    assert.deepEqual(restoreWriteoffSelection([original], [current]), [current])
    assert.equal(current.writeoffAmount, 40)
    assert.deepEqual(
      restoreWriteoffSelection([original], [{ ...current, availableAmount: 60 }]),
      []
    )
    assert.deepEqual(
      restoreWriteoffSelection(
        [original],
        [{ ...current, matchValues: { executionId: 'reconfirmed' } }]
      ),
      []
    )
    assert.deepEqual(
      restoreWriteoffSelection([original], [{ ...current, accountSetId: 'another' }]),
      []
    )
    assert.deepEqual(restoreWriteoffSelection([original], []), [])
    assert.equal(original.writeoffAmount, 40)
  })
  it('keeps each relationship original and local amounts independent, including payment discounts', () => {
    for (const relation of [
      'payable_payment',
      'payment_refund',
      'payable_receivable',
      'payable_red_blue',
      'payable_refund'
    ] as const)
      assert.equal(payableWriteoffUsesBookAmounts(relation), true)
    assert.deepEqual(
      payableWriteoffMoneyValues(
        {
          amount: 102,
          paymentAmount: 100,
          cashDiscountAmount: 2,
          payableBaseAmount: 714,
          paymentBaseAmount: 720,
          cashDiscountBaseAmount: 14.4
        },
        'payable_payment'
      ),
      { secondaryAmount: 102, primaryBaseAmount: 714, secondaryBaseAmount: 734.4 }
    )
    assert.deepEqual(
      payableWriteoffMoneyValues(
        { amount: 90, refundAmount: 100, paymentBaseAmount: 720, refundBaseAmount: 730 },
        'payment_refund'
      ),
      { secondaryAmount: 100, primaryBaseAmount: 720, secondaryBaseAmount: 730 }
    )
    assert.deepEqual(
      payableWriteoffMoneyValues(
        {
          amount: 0.24,
          receivableAmount: 0.03,
          payableBaseAmount: 0.24,
          receivableBaseAmount: 0.22
        },
        'payable_receivable'
      ),
      { secondaryAmount: 0.03, primaryBaseAmount: 0.24, secondaryBaseAmount: 0.22 }
    )
    assert.equal(
      payableWriteoffMoneyValues(
        { amount: 100, paymentFaceAmount: '***', paymentAmount: 98, cashDiscountAmount: 2 },
        'payable_payment'
      ).secondaryAmount,
      '***'
    )
    assert.equal(
      payableWriteoffMoneyValues(
        { amount: 100, paymentBaseAmount: 700, cashDiscountBaseAmount: '***' },
        'payable_payment'
      ).secondaryBaseAmount,
      '***'
    )
    assert.equal(
      payableWriteoffMoneyValues({ amount: 100, receivableAmount: null }, 'payable_receivable')
        .secondaryAmount,
      null
    )
    assert.equal(
      payableWriteoffMoneyValues({ amount: 100, currencyCode: 'CNY' }, 'payable_payment')
        .secondaryAmount,
      100
    )
    assert.equal(
      payableWriteoffMoneyValues(
        { amount: 100, currencyCode: 'CNY', secondaryCurrencyCode: 'USD' },
        'payable_payment'
      ).secondaryAmount,
      undefined
    )
    assert.equal(payableWriteoffMoneyFields('payable_refund').positiveDifference, 'loss')
    assert.equal(payableWriteoffMoneyFields('payment_refund').positiveDifference, 'gain')
  })
  it('preserves transport same-source restrictions when adding foreign manual pairs', () => {
    assert.throws(
      () =>
        allocatePayableBookAmounts(
          [
            {
              id: 'invoice',
              currencyCode: 'CNY',
              accountSetId: 'book',
              availableAmount: 700,
              sameSourceOnly: true
            }
          ],
          [
            {
              id: 'payment',
              currencyCode: 'USD',
              accountSetId: 'book',
              availableAmount: 100,
              sameSourceOnly: true,
              sourcePayableId: 'invoice'
            }
          ],
          'payable_payment'
        ),
      /运输同源结算暂不支持异币/
    )
  })
  it('allocates transport noncash rows to their original payable regardless of selection order', () => {
    const primary = [
      { id: 'first', availableAmount: 10 },
      { id: 'second', availableAmount: 20 }
    ]
    const secondary = [
      {
        id: 'payment-second',
        availableAmount: 20,
        sameSourceOnly: true,
        sourcePayableId: 'second'
      },
      { id: 'payment-first', availableAmount: 10, sameSourceOnly: true, sourcePayableId: 'first' }
    ]
    assert.deepEqual(allocateWriteoffAmounts(primary, secondary), [
      { primaryId: 'second', secondaryId: 'payment-second', amount: 20 },
      { primaryId: 'first', secondaryId: 'payment-first', amount: 10 }
    ])
    assert.equal(primary[0].availableAmount, 10)
    assert.equal(secondary[0].availableAmount, 20)
  })
  it('does not redirect a source-bound noncash row to an unrelated payable', () => {
    assert.throws(
      () =>
        allocateWriteoffAmounts(
          [{ id: 'selected', availableAmount: 10 }],
          [{ id: 'payment', availableAmount: 10, sameSourceOnly: true, sourcePayableId: 'another' }]
        ),
      /只能核销原财务应付/
    )
    assert.throws(
      () =>
        allocateWriteoffAmounts(
          [{ id: 'selected', availableAmount: 10 }],
          [{ id: 'payment', availableAmount: 10, sameSourceOnly: true }]
        ),
      /只能核销原财务应付/
    )
  })
  it('reserves source-bound amounts before allocating flexible payments', () => {
    assert.deepEqual(
      allocateWriteoffAmounts(
        [
          { id: 'first', availableAmount: 10 },
          { id: 'second', availableAmount: 10 }
        ],
        [
          { id: 'flexible', availableAmount: 15 },
          { id: 'bound', availableAmount: 5, sameSourceOnly: true, sourcePayableId: 'first' }
        ]
      ),
      [
        { primaryId: 'first', secondaryId: 'bound', amount: 5 },
        { primaryId: 'first', secondaryId: 'flexible', amount: 5 },
        { primaryId: 'second', secondaryId: 'flexible', amount: 10 }
      ]
    )
  })
  it('rejects source-bound amounts larger than the selected original payable amount', () => {
    assert.throws(
      () =>
        allocateWriteoffAmounts(
          [
            { id: 'first', availableAmount: 5 },
            { id: 'second', availableAmount: 5 }
          ],
          [{ id: 'payment', availableAmount: 10, sameSourceOnly: true, sourcePayableId: 'first' }]
        ),
      /超过对应应付的选择金额/
    )
  })
  it('does not fill an uncovered transport payable using unrelated flexible payments', () => {
    assert.throws(
      () =>
        allocateWriteoffAmounts(
          [{ id: 'transport', availableAmount: 10, sameSourceOnly: true }],
          [
            { id: 'bound', availableAmount: 5, sameSourceOnly: true, sourcePayableId: 'transport' },
            { id: 'other', availableAmount: 5 }
          ]
        ),
      /不能混配其他付款/
    )
  })
  it('keeps linked record source titles independent from the current workbench relation', () => {
    assert.deepEqual(payableWriteoffSourceTitles('payable_red_blue'), {
      primary: '蓝字财务应付单',
      secondary: '红字财务应付单'
    })
    assert.deepEqual(payableWriteoffSourceTitles('payment_refund'), {
      primary: '付款单',
      secondary: '付款退款单'
    })
    assert.deepEqual(payableWriteoffSourceTitles('payable_receivable'), {
      primary: '财务应付单',
      secondary: '财务应收单'
    })
    assert.deepEqual(payableWriteoffSourceTitles('payable_payment'), {
      primary: '财务应付单',
      secondary: '付款单'
    })
  })
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
    assert.equal(
      preferredPayableWriteoffScheme(
        [
          {
            id: 'wrong',
            code: 'AP-MANUAL',
            name: '仅付款',
            enabled: true,
            relationRules: [{ relation: 'payable_payment', rules: [] }]
          },
          {
            id: 'right',
            code: 'RED',
            name: '仅红蓝',
            enabled: true,
            relationRules: [{ relation: 'payable_red_blue', rules: [] }]
          }
        ],
        'payable_red_blue'
      ),
      'right'
    )
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
    assert.equal(labels.guarantee, '采购保证金')
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
      allocatePayableBookAmounts(
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
        { primaryId: 'blue-cny', secondaryId: 'credit-cny', amount: 50, secondaryAmount: 50 },
        { primaryId: 'blue-usd', secondaryId: 'credit-usd', amount: 100, secondaryAmount: 100 }
      ]
    )
    assert.deepEqual(
      allocatePayableBookAmounts(
        [{ id: 'blue', currencyCode: 'USD', accountSetId: 'one', availableAmount: 100 }],
        [{ id: 'credit', currencyCode: 'EUR', accountSetId: 'one', availableAmount: 90 }]
      ),
      [{ primaryId: 'blue', secondaryId: 'credit', amount: 100, secondaryAmount: 90 }]
    )
    assert.throws(
      () =>
        allocatePayableBookAmounts(
          [{ id: 'blue', currencyCode: 'CNY', accountSetId: 'one', availableAmount: 100 }],
          [{ id: 'credit', currencyCode: 'CNY', accountSetId: 'two', availableAmount: 100 }]
        ),
      /跨账套/
    )
    assert.throws(
      () =>
        allocatePayableBookAmounts(
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
    assert.equal(formatPayableExchangeDifference(undefined), '--')
    assert.equal(formatPayableExchangeDifference(null), '--')
    assert.equal(formatPayableExchangeDifference('***'), '***')
    assert.equal(formatPayableExchangeDifference(Number.NaN), '--')
    assert.match(formatPayableExchangeDifference(10, 'CNY', 'loss'), /损失.*10\.00/)
    assert.match(formatPayableExchangeDifference(-10, 'CNY', 'loss'), /收益.*10\.00/)
    assert.equal(
      formatPayableCurrencyTotals(
        [{ currencyCode: 'CNY', amount: undefined }],
        (row) => row.amount
      ),
      '--'
    )
    assert.equal(
      formatPayableCurrencyTotals([{ currencyCode: 'USD', amount: '***' }], (row) => row.amount),
      '***'
    )
    assert.equal(
      formatPayableCurrencyTotals(
        [
          { currencyCode: 'CNY', amount: 100 },
          { currencyCode: 'CNY', amount: undefined }
        ],
        (row) => row.amount
      ),
      '--'
    )
  })
  it('allocates supplier refund original amounts without changing credit or receipt direction', () => {
    assert.deepEqual(
      allocatePayableBookAmounts(
        [{ id: 'credit', currencyCode: 'USD', accountSetId: 'book', availableAmount: 100 }],
        [{ id: 'receipt-line', currencyCode: 'EUR', accountSetId: 'book', availableAmount: 90 }],
        'payable_refund'
      ),
      [{ primaryId: 'credit', secondaryId: 'receipt-line', amount: 100, secondaryAmount: 90 }]
    )
    assert.deepEqual(payableWriteoffSourceTitles('payable_refund'), {
      primary: '红字财务应付单',
      secondary: '供应商退款收款单'
    })
  })
})
