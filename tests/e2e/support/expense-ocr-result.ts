export const createExpenseOcrResult = (name: string): Api.Fms.WaybillExpenseOcrAnalyzeResponse => ({
  artifactId: name,
  runId: name,
  generatedAt: '2026-10-23T00:00:00Z',
  rawText: `合成票据-${name}`,
  summary: `识别结果-${name}`,
  confidence: 0.95,
  fieldConfidence: {},
  missingFields: [],
  warnings: [],
  expense: {
    amount: 10,
    occurredOn: '2026-10-23',
    quantity: null,
    unitPrice: null,
    providerName: null,
    payeeName: null,
    paymentChannel: null,
    invoiceNo: null,
    meterNo: null,
    expenseLocation: null,
    remark: null
  },
  reviewConfidenceThreshold: 0.8
})
