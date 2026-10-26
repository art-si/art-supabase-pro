import assert from 'node:assert/strict'
import test from 'node:test'
import {
  newPayableSettlement,
  newPayableSettlementLine,
  settlementPaymentLabel,
  settlementStatusLabel,
  settlementTitles,
  validateSettlementAmounts,
  settlementFundAccountOptions,
  settlementSourceConflict,
  applySettlementSourceContext
} from '../../src/utils/finance/payable-settlement'
import { financePaths } from '../../src/router/business-paths'
import type { PayableSettlementOptions } from '../../src/api/payable-settlement.types'

function sourceContextOptions(): PayableSettlementOptions {
  return {
    tenantId: 'tenant',
    supplier: [],
    purpose: [],
    method: [],
    fund: [],
    project: [],
    organization: [],
    documentType: [],
    currency: [],
    payable: [],
    purchase: [],
    expense: []
  }
}

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

test('customer refunds use real AR/customer identities and require their own approved application', () => {
  const line = {
    ...newPayableSettlementLine(10),
    purposeId: 'sales-refund',
    customerId: 'customer',
    payeeCustomerId: 'payee-customer',
    receivableLineId: 'original-ar-line',
    settlementMethodId: 'cash',
    amount: 100,
    approvedAmount: 100,
    plannedAmount: 100
  }
  assert.equal(validateSettlementAmounts([line], 'application'), null)
  assert.match(validateSettlementAmounts([line], 'payment') || '', /已审核申请/)
  assert.equal(
    validateSettlementAmounts(
      [{ ...line, applicationLineId: 'approved-application-line' }],
      'payment'
    ),
    null
  )
  for (const change of [
    { supplierId: 'not-a-customer' },
    { carrierId: 'not-a-customer' },
    { payeeCustomerId: null },
    { receivableLineId: null },
    { cashDiscount: 1 },
    { taxRate: 13 }
  ])
    assert.notEqual(validateSettlementAmounts([{ ...line, ...change }], 'application'), null)
})

test('AR sources constrain fund accounts even before the header receives its original book', () => {
  const document = newPayableSettlement('application')
  const line = {
    ...newPayableSettlementLine(10),
    receivableLineId: 'original-ar-line',
    settlementMethodId: 'cash'
  }
  document.lines = [line]
  const options = sourceContextOptions()
  options.method = [{ id: 'cash', code: 'CASH', name: '现金', category: 'cash' }]
  options.receivable = [
    { id: 'original-ar-line', code: 'AR-001', name: '客户', accountSetId: 'original-ar-book' }
  ]
  options.fund = [
    {
      id: 'original-fund',
      code: 'A',
      name: '原账套账户',
      accountSetId: 'original-ar-book',
      currencyCode: 'CNY',
      category: 'cash'
    },
    {
      id: 'other-fund',
      code: 'B',
      name: '另一账套账户',
      accountSetId: 'other-book',
      currencyCode: 'CNY',
      category: 'cash'
    }
  ]
  assert.deepEqual(
    settlementFundAccountOptions(document, options, line).map((fund) => fund.id),
    ['original-fund']
  )
})

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

test('all settlement lines and the original document constrain fund accounts to one book', () => {
  const document = newPayableSettlement('payment')
  document.currencyCode = 'USD'
  document.accountSetId = 'original-book'
  const line = { ...newPayableSettlementLine(10), settlementMethodId: 'remittance' }
  document.lines = [line, { ...newPayableSettlementLine(20), payableId: 'source' }]
  const options: PayableSettlementOptions = {
    tenantId: 'tenant',
    supplier: [],
    purpose: [],
    project: [],
    organization: [],
    documentType: [],
    currency: [],
    expense: [],
    purchase: [],
    method: [{ id: 'remittance', code: 'REM', name: '电汇', category: 'remittance' }],
    payable: [{ id: 'source', code: 'AP', name: '原应付', accountSetId: 'original-book' }],
    fund: [
      {
        id: 'valid',
        code: 'A',
        name: '同账套美元账户',
        currencyCode: 'USD',
        accountSetId: 'original-book',
        category: 'bank'
      },
      {
        id: 'other-book',
        code: 'B',
        name: '其他账套账户',
        currencyCode: 'USD',
        accountSetId: 'other-book',
        category: 'bank'
      },
      {
        id: 'other-currency',
        code: 'C',
        name: '同账套人民币账户',
        currencyCode: 'CNY',
        accountSetId: 'original-book',
        category: 'bank'
      },
      {
        id: 'cash',
        code: 'D',
        name: '同账套美元现金',
        currencyCode: 'USD',
        accountSetId: 'original-book',
        category: 'cash'
      }
    ]
  }
  assert.deepEqual(
    settlementFundAccountOptions(document, options, line).map((item) => item.id),
    ['valid']
  )
  options.payable[0].accountSetId = 'other-book'
  assert.deepEqual(settlementFundAccountOptions(document, options, line), [])
  options.payable[0].accountSetId = 'original-book'
  options.method[0].category = 'cash'
  assert.deepEqual(
    settlementFundAccountOptions(document, options, line).map((item) => item.id),
    ['cash']
  )
  document.lines[1].accountSetId = 'other-book'
  assert.deepEqual(settlementFundAccountOptions(document, options, line), [])
  document.accountSetId = null
  document.lines[1].accountSetId = null
  document.lines[1].payableId = null
  document.lines[1].fundAccountId = 'valid'
  options.method[0].category = 'remittance'
  assert.deepEqual(
    settlementFundAccountOptions(document, options, line).map((item) => item.id),
    ['valid']
  )
  document.lines[1].fundAccountId = 'other-book'
  assert.deepEqual(
    settlementFundAccountOptions(document, options, line).map((item) => item.id),
    ['other-book']
  )
})

test('purchase and refund source books constrain application and receiving accounts', () => {
  const document = newPayableSettlement('application')
  const line = { ...newPayableSettlementLine(10), purchaseId: 'purchase' }
  document.lines = [line]
  const options: PayableSettlementOptions = {
    tenantId: 'tenant',
    supplier: [],
    purpose: [],
    method: [],
    project: [],
    organization: [],
    documentType: [],
    currency: [],
    payable: [],
    expense: [],
    purchase: [{ id: 'purchase', code: 'PO', name: '采购订单', accountSetId: 'source-book' }],
    fund: [
      {
        id: 'valid',
        code: 'A',
        name: '来源账套银行',
        currencyCode: 'CNY',
        accountSetId: 'source-book',
        category: 'bank'
      },
      {
        id: 'other',
        code: 'B',
        name: '其他账套银行',
        currencyCode: 'CNY',
        accountSetId: 'other-book',
        category: 'bank'
      }
    ]
  }
  assert.deepEqual(
    settlementFundAccountOptions(document, options, line).map((item) => item.id),
    ['valid']
  )
  document.kind = 'refund'
  line.purchaseId = ''
  line.accountSetId = 'source-book'
  assert.deepEqual(
    settlementFundAccountOptions(document, options, line).map((item) => item.id),
    ['valid']
  )
})

test('the first foreign source adopts its original book and currency without copying its invoice rate', () => {
  const document = newPayableSettlement('application')
  const line = newPayableSettlementLine(10)
  document.lines = [line]
  document.exchangeRate = 1
  const source = {
    accountSetId: 'book',
    accountSetName: '来源账套',
    currencyCode: 'USD',
    baseCurrencyCode: 'CNY',
    exchangeRate: 123
  }
  assert.equal(settlementSourceConflict(document, sourceContextOptions(), line, source), null)
  applySettlementSourceContext(document, source)
  assert.equal(document.accountSetId, 'book')
  assert.equal(document.accountSetName, '来源账套')
  assert.equal(document.currencyCode, 'USD')
  assert.equal(document.baseCurrencyCode, 'CNY')
  assert.equal(document.exchangeRate, null)
  assert.equal(document.currencyId, null)
  assert.equal(document.fxSnapshotVersion, undefined)
})

test('source selection rejects mixed currency and books once other rows or a stored document bind them', () => {
  const document = newPayableSettlement('refund')
  const line = newPayableSettlementLine(10)
  const other = {
    ...newPayableSettlementLine(20),
    refundPaymentLineId: 'other-payment',
    accountSetId: 'book'
  }
  document.lines = [line, other]
  const options = sourceContextOptions()
  assert.match(
    settlementSourceConflict(document, options, line, {
      currencyCode: 'USD',
      accountSetId: 'book'
    }) || '',
    /币种/
  )
  assert.match(
    settlementSourceConflict(document, options, line, {
      currencyCode: 'CNY',
      accountSetId: 'other-book'
    }) || '',
    /账套/
  )
  document.lines = [line]
  document.id = 'stored'
  assert.match(
    settlementSourceConflict(document, options, line, { currencyCode: 'USD' }) || '',
    /币种/
  )
  document.accountSetId = 'book'
  assert.match(
    settlementSourceConflict(document, options, line, { accountSetId: 'other-book' }) || '',
    /账套/
  )
})

test('a same-context source keeps the payment historical rate and accounts selected on other rows constrain its book', () => {
  const document = newPayableSettlement('payment')
  const line = newPayableSettlementLine(10)
  document.currencyCode = 'USD'
  document.accountSetId = 'book'
  document.exchangeRate = 7.2
  document.fxSnapshotVersion = 1
  document.currencyId = 'usd'
  document.lines = [line]
  applySettlementSourceContext(document, {
    accountSetId: 'book',
    currencyCode: 'USD',
    baseCurrencyCode: 'CNY'
  })
  assert.equal(document.exchangeRate, 7.2)
  assert.equal(document.currencyId, 'usd')
  assert.equal(document.fxSnapshotVersion, 1)
  const options = sourceContextOptions()
  options.fund = [
    {
      id: 'other',
      code: 'B',
      name: '其他账套资金户',
      accountSetId: 'other-book',
      currencyCode: 'USD'
    }
  ]
  document.accountSetId = null
  document.lines.push({ ...newPayableSettlementLine(20), fundAccountId: 'other' })
  assert.match(
    settlementSourceConflict(document, options, line, {
      accountSetId: 'book',
      currencyCode: 'USD'
    }) || '',
    /账套/
  )
})

test('malformed source currency metadata is rejected before it can reach a money formatter', () => {
  const document = newPayableSettlement('application')
  const line = newPayableSettlementLine(10)
  document.lines = [line]
  for (const currencyCode of ['123', 'USDT', 'usd'])
    assert.match(
      settlementSourceConflict(document, sourceContextOptions(), line, { currencyCode }) || '',
      /来源币种资料无效/
    )
})
