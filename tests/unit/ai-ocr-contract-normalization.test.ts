import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeAccessoryOcr,
  validateAccessoryOcr
} from '../../supabase/functions/_shared/ai-accessory-processing-contract'
import {
  normalizeAiCashVoucherResponse,
  validateAiCashVoucherProviderPayload
} from '../../supabase/functions/_shared/ai-cash-voucher-ocr-contract'
import {
  coerceAiInvoiceOcrProviderPayload,
  normalizeAiInvoiceOcrResponse,
  validateAiInvoiceOcrProviderPayload
} from '../../supabase/functions/_shared/ai-invoice-ocr-contract'
import {
  normalizeAiWaybillExpenseResponse,
  validateAiWaybillExpensePayload
} from '../../supabase/functions/_shared/ai-waybill-expense-ocr-contract'
import {
  assessAiWaybillReceipt,
  normalizeAiWaybillReceiptResponse,
  validateAiWaybillReceiptProviderPayload
} from '../../supabase/functions/_shared/ai-waybill-receipt-ocr-contract'

test('OCR contracts reject non-record envelopes and do not read array drafts as records', () => {
  for (const invalid of [null, undefined, [], '', 1, false]) {
    for (const validate of [
      validateAiCashVoucherProviderPayload,
      validateAiInvoiceOcrProviderPayload,
      validateAiWaybillExpensePayload,
      validateAiWaybillReceiptProviderPayload
    ]) {
      assert.deepEqual(validate(invalid), { valid: false, errors: ['payload must be an object'] })
    }
    assert.deepEqual(validateAccessoryOcr(invalid), { valid: false, errors: ['响应不是对象'] })
    assert.equal(coerceAiInvoiceOcrProviderPayload(invalid), null)
  }
  for (const invalid of [null, [], 1, 'draft']) {
    assert.equal(normalizeAiCashVoucherResponse({ voucher: invalid }).voucher.amount, null)
    assert.equal(normalizeAiInvoiceOcrResponse({ invoice: invalid }).invoice.totalAmount, null)
    assert.equal(normalizeAiWaybillExpenseResponse({ expense: invalid }).expense.amount, null)
    assert.equal(
      normalizeAiWaybillReceiptResponse({ receipt: invalid }).receipt.signedQuantity,
      null
    )
  }
})

test('accessory OCR skips non-record rows and variants and rejects array sketches and confidence', () => {
  const result = normalizeAccessoryOcr({
    rawText: ' 加工件 ',
    fieldConfidence: [0.9],
    rows: [
      null,
      [],
      'row',
      {
        rowNo: 1,
        name: ' 泛水板 ',
        widthMm: -5,
        sketch: [1, 20, 30, 40, 50],
        variants: [null, [], 'variant', { lengthM: 2.7, quantity: 1 }]
      }
    ]
  })
  assert.equal(result.rawText, '加工件')
  assert.deepEqual(result.fieldConfidence, {})
  assert.deepEqual(result.items, [
    {
      rowNo: 1,
      name: '泛水板',
      widthMm: -5,
      lengthM: 2.7,
      quantity: 1,
      materialColor: '',
      remark: '',
      sketch: null
    }
  ])
  assert.deepEqual(result.warnings, ['部分加工草图位置未识别，生成前需人工补充'])
})

test('OCR draft numeric normalization keeps existing finite non-negative conversions', () => {
  // These are normalizer contracts; provider validation still rejects non-number monetary fields.
  const cases: Array<{ input: unknown; expected: number | null }> = [
    { input: undefined, expected: null },
    { input: null, expected: null },
    { input: '', expected: null },
    { input: '  ', expected: 0 },
    { input: 0, expected: 0 },
    { input: -0, expected: -0 },
    { input: '12.50', expected: 12.5 },
    { input: -1, expected: null },
    { input: '-1', expected: null },
    { input: NaN, expected: null },
    { input: Infinity, expected: null },
    { input: -Infinity, expected: null },
    { input: 'not-a-number', expected: null },
    { input: '1,000', expected: null },
    { input: false, expected: 0 },
    { input: true, expected: 1 },
    { input: [], expected: 0 },
    { input: [2], expected: 2 }
  ]
  for (const { input, expected } of cases) {
    assert.equal(
      normalizeAiCashVoucherResponse({ voucher: { amount: input } }).voucher.amount,
      expected
    )
    assert.equal(
      normalizeAiInvoiceOcrResponse({ invoice: { totalAmount: input } }).invoice.totalAmount,
      expected
    )
    assert.equal(
      normalizeAiWaybillExpenseResponse({ expense: { amount: input } }).expense.amount,
      expected
    )
    assert.equal(
      normalizeAiWaybillReceiptResponse({ receipt: { signedQuantity: input } }).receipt
        .signedQuantity,
      expected
    )
  }
})

test('OCR confidence remains bounded and normalized field confidence retains its whitelist', () => {
  for (const [input, expected] of [
    [undefined, 0],
    [null, 0],
    [-0.3, 0],
    ['0.8', 0.8],
    [2, 1],
    [Infinity, 0],
    [NaN, 0]
  ] as const) {
    for (const result of [
      normalizeAiCashVoucherResponse({ confidence: input }),
      normalizeAiInvoiceOcrResponse({ confidence: input }),
      normalizeAiWaybillExpenseResponse({ confidence: input }),
      normalizeAiWaybillReceiptResponse({ confidence: input })
    ])
      assert.equal(result.confidence, expected)
  }
  assert.deepEqual(
    normalizeAiWaybillExpenseResponse({
      fieldConfidence: { amount: 3, occurredOn: -1, unknown: 1 }
    }).fieldConfidence,
    { amount: 1, occurredOn: 0 }
  )
  assert.deepEqual(
    normalizeAiWaybillReceiptResponse({
      fieldConfidence: { waybillNo: -1, signedAt: '0.8', unknown: 1 }
    }).fieldConfidence,
    { waybillNo: 0, signedAt: 0.8 }
  )
  assert.deepEqual(
    normalizeAiInvoiceOcrResponse({ fieldConfidence: { totalAmount: 2, taxRate: NaN, unknown: 1 } })
      .fieldConfidence,
    { taxRate: 0, totalAmount: 1 }
  )
})

test('OCR warning limits apply before stable duplicate removal', () => {
  const warnings = [
    ' duplicate ',
    'duplicate',
    '',
    null,
    '警'.repeat(520),
    ...Array.from({ length: 21 }, (_, index) => `警告${index}`)
  ]
  const expected = [
    'duplicate',
    '警'.repeat(500),
    ...Array.from({ length: 17 }, (_, index) => `警告${index}`)
  ]
  for (const result of [
    normalizeAiCashVoucherResponse({ warnings }),
    normalizeAiInvoiceOcrResponse({ warnings }),
    normalizeAiWaybillExpenseResponse({ warnings }),
    normalizeAiWaybillReceiptResponse({ warnings })
  ])
    assert.deepEqual(result.warnings, expected)
})

test('expense normalization keeps per-field limits, zero amounts and OCR text cleanup', () => {
  const limits = [
    ['providerName', 200],
    ['payeeName', 200],
    ['paymentChannel', 80],
    ['invoiceNo', 120],
    ['meterNo', 120],
    ['expenseLocation', 300],
    ['remark', 500]
  ] as const
  const longText = '  ' + '文'.repeat(1005) + '  '
  const result = normalizeAiWaybillExpenseResponse({
    rawText: '费用\u0000\r\n票据',
    summary: longText,
    expense: {
      ...Object.fromEntries(limits.map(([key]) => [key, longText])),
      amount: 0,
      quantity: '2.5',
      unitPrice: 0,
      occurredOn: '2000年2月29日'
    }
  })
  for (const [key, limit] of limits) assert.equal(result.expense[key], '文'.repeat(limit))
  assert.equal(result.rawText, '费用\n票据')
  assert.equal(result.summary.length, 500)
  assert.equal(result.expense.quantity, 2.5)
  assert.equal(result.expense.unitPrice, 0)
  assert.equal(result.expense.amount, 0)
  assert.deepEqual(result.missingFields, [])
})

test('expense and invoice dates preserve strict calendar validation', () => {
  for (const [input, expected] of [
    ['2000年2月29日', '2000-02-29'],
    ['2024.2.29', '2024-02-29'],
    ['1900-02-29', null],
    ['2023-02-29', null],
    ['2026/4/31', null],
    ['2026-13-1', null],
    ['', null],
    ['invalid', null]
  ] as const) {
    const expense = normalizeAiWaybillExpenseResponse({ expense: { amount: 0, occurredOn: input } })
    assert.equal(expense.expense.occurredOn, expected)
    assert.deepEqual(expense.missingFields, expected === null ? ['发生日期'] : [])
    const invoice = normalizeAiInvoiceOcrResponse({
      invoice: { invoiceNo: 'AB123456', totalAmount: 0, issueDate: input }
    })
    assert.equal(invoice.invoice.issueDate, expected)
    assert.deepEqual(invoice.missingFields, expected === null ? ['开票日期'] : [])
  }
})

test('receipt normalization preserves UTC timestamps and its longer exception note', () => {
  const longText = '  ' + '文'.repeat(1005) + '  '
  const result = normalizeAiWaybillReceiptResponse({
    summary: longText,
    receipt: {
      waybillNo: longText,
      signerName: longText,
      exceptionNote: longText,
      signedAt: '2026-11-20T09:00:00+08:00',
      deliveryResult: 'unknown'
    }
  })
  assert.equal(result.receipt.waybillNo, '文'.repeat(120))
  assert.equal(result.receipt.signerName, '文'.repeat(120))
  assert.equal(result.receipt.exceptionNote, '文'.repeat(1000))
  assert.equal(result.summary.length, 500)
  assert.equal(result.receipt.signedAt, '2026-11-20T01:00:00.000Z')
  assert.equal(result.receipt.deliveryResult, 'unclear')
  assert.deepEqual(result.missingFields, [])
  const invalid = normalizeAiWaybillReceiptResponse({
    receipt: { waybillNo: 'WB-1', signerName: '甲', signedAt: 'invalid' }
  })
  assert.equal(invalid.receipt.signedAt, null)
  assert.deepEqual(invalid.missingFields, ['签收时间'])
})

test('receipt assessment retains expected-quantity normalization and matching policy', () => {
  const receipt = normalizeAiWaybillReceiptResponse({
    receipt: {
      waybillNo: ' WB /_1 ',
      signerName: '甲',
      signedAt: '2026-11-20T09:00:00+08:00',
      deliveryResult: 'normal',
      signedQuantity: 1
    }
  }).receipt
  for (const expected of [undefined, null, -1, NaN, Infinity, 0, 1]) {
    const result = assessAiWaybillReceipt(receipt, {
      orderNo: 'wb-1',
      cargoQuantityTotal: expected
    })
    assert.equal(result.matched, true)
    assert.equal(result.riskLevel, 'none')
    assert.equal(result.recommendedAction, 'normal_review')
  }
  const shortage = assessAiWaybillReceipt(receipt, { orderNo: 'wb-1', cargoQuantityTotal: 2 })
  assert.equal(shortage.riskLevel, 'high')
  assert.equal(shortage.recommendedAction, 'manual_review')
  assert.deepEqual(
    shortage.signals.map(({ type }) => type),
    ['quantity_mismatch']
  )
})

test('invoice provider coercion keeps currency and percentage handling before normalization', () => {
  const longText = '文'.repeat(400)
  const prepared = coerceAiInvoiceOcrProviderPayload({
    result: {
      rawText: '发票\u0000\r\n票面',
      summary: '文'.repeat(600),
      confidence: '0.8',
      fieldConfidence: { totalAmount: '0.9' },
      invoice: {
        invoiceType: '电子发票',
        invoiceTitle: longText,
        buyerName: longText,
        sellerName: longText,
        invoiceNo: ' ab 123456 ',
        issueDate: '2024年2月29日',
        taxRate: '6%',
        amountExcludingTax: '￥1，000.00',
        taxAmount: '¥60',
        totalAmount: '1 060.00'
      }
    }
  })
  assert.ok(prepared)
  assert.deepEqual(validateAiInvoiceOcrProviderPayload(prepared), { valid: true, errors: [] })
  const result = normalizeAiInvoiceOcrResponse(prepared)
  assert.equal(result.rawText, '发票\n票面')
  assert.equal(result.summary.length, 500)
  assert.equal(result.confidence, 0.8)
  assert.deepEqual(result.fieldConfidence, { totalAmount: 0.9 })
  assert.equal(result.invoice.invoiceType, 'electronic')
  assert.equal(result.invoice.invoiceNo, 'AB123456')
  assert.equal(result.invoice.issueDate, '2024-02-29')
  for (const key of ['invoiceTitle', 'buyerName', 'sellerName'] as const)
    assert.equal(result.invoice[key], '文'.repeat(300))
  assert.equal(result.invoice.taxRate, 6)
  assert.equal(result.invoice.amountExcludingTax, 1000)
  assert.equal(result.invoice.taxAmount, 60)
  assert.equal(result.invoice.totalAmount, 1060)
  assert.deepEqual(result.missingFields, [])
  assert.deepEqual(result.warnings, [])
})

test('invoice coercion preserves invalid-amount rejection and missing-confidence feedback', () => {
  for (const totalAmount of ['￥-1.25', 'not-money']) {
    const prepared = coerceAiInvoiceOcrProviderPayload({
      confidence: 0.9,
      fieldConfidence: {},
      invoice: { totalAmount }
    })
    assert.ok(prepared)
    assert.equal(validateAiInvoiceOcrProviderPayload(prepared).valid, false)
    assert.equal(normalizeAiInvoiceOcrResponse(prepared).invoice.totalAmount, null)
  }
  const prepared = coerceAiInvoiceOcrProviderPayload({
    fieldConfidence: {},
    invoice: { invoiceNo: 'AB123456', issueDate: '2024-02-29', totalAmount: 0 }
  })
  assert.ok(prepared)
  assert.deepEqual(validateAiInvoiceOcrProviderPayload(prepared), { valid: true, errors: [] })
  const result = normalizeAiInvoiceOcrResponse(prepared)
  assert.equal(result.confidence, 0)
  assert.deepEqual(result.missingFields, [])
  assert.deepEqual(result.warnings, ['AI 服务未返回置信度，识别结果必须人工复核。'])
})
