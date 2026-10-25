import { normalizeOcrRawText } from './ai-ocr-text.ts'

export const AI_INVOICE_OCR_FIELDS = [
  'invoiceType',
  'invoiceTitle',
  'taxNumber',
  'invoiceCode',
  'invoiceNo',
  'issueDate',
  'taxRate',
  'amountExcludingTax',
  'taxAmount',
  'totalAmount',
  'buyerName',
  'buyerTaxNumber',
  'sellerName',
  'sellerTaxNumber'
] as const

const AI_INVOICE_OCR_APPLIED_FIELDS = [
  'invoiceType',
  'invoiceTitle',
  'taxNumber',
  'invoiceCode',
  'invoiceNo',
  'issueDate',
  'taxRate',
  'amountExcludingTax',
  'taxAmount',
  'totalAmount'
] as const

export type AiInvoiceOcrField = (typeof AI_INVOICE_OCR_FIELDS)[number]

export interface AiInvoiceOcrDraft {
  invoiceType: string | null
  invoiceTitle: string | null
  taxNumber: string | null
  invoiceCode: string | null
  invoiceNo: string | null
  issueDate: string | null
  taxRate: number | null
  amountExcludingTax: number | null
  taxAmount: number | null
  totalAmount: number | null
  buyerName: string | null
  buyerTaxNumber: string | null
  sellerName: string | null
  sellerTaxNumber: string | null
}

export interface AiInvoiceOcrNormalizedResponse {
  rawText: string
  summary: string
  confidence: number
  fieldConfidence: Partial<Record<AiInvoiceOcrField, number>>
  missingFields: string[]
  warnings: string[]
  invoice: AiInvoiceOcrDraft
}

export interface ContractValidationResult {
  valid: boolean
  errors: string[]
}

const INVOICE_TYPES = new Set(['vat_special', 'vat_ordinary', 'electronic'])
const MONEY_FIELDS = ['taxRate', 'amountExcludingTax', 'taxAmount', 'totalAmount'] as const
const TEXT_FIELDS = [
  'invoiceTitle',
  'taxNumber',
  'invoiceCode',
  'invoiceNo',
  'buyerName',
  'buyerTaxNumber',
  'sellerName',
  'sellerTaxNumber'
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function numericValue(value: unknown): unknown {
  if (typeof value !== 'string' || !value.trim()) return value
  const parsed = Number(value.trim().replace(/[￥¥,，\s]/g, '').replace(/%$/, ''))
  return Number.isFinite(parsed) ? parsed : value
}

function hasInvoiceField(value: Record<string, unknown>): boolean {
  return AI_INVOICE_OCR_FIELDS.some((field) => field in value)
}

function unwrapInvoicePayload(payload: Record<string, unknown>): Record<string, unknown> {
  for (const key of ['result', 'data', 'output', 'response', 'expectedShape']) {
    const candidate = payload[key]
    if (isRecord(candidate) && (isRecord(candidate.invoice) || hasInvoiceField(candidate))) {
      return candidate
    }
  }
  return payload
}

export function coerceAiInvoiceOcrProviderPayload(
  payload: unknown
): Record<string, unknown> | null {
  if (!isRecord(payload)) return null
  const source = unwrapInvoicePayload(payload)
  const invoiceSource = isRecord(source.invoice)
    ? source.invoice
    : hasInvoiceField(source)
      ? source
      : null
  if (!invoiceSource) return source

  const invoice: Record<string, unknown> = {}
  for (const field of AI_INVOICE_OCR_FIELDS) {
    if (field in invoiceSource) invoice[field] = invoiceSource[field]
  }
  for (const field of MONEY_FIELDS) {
    if (field in invoice) invoice[field] = numericValue(invoice[field])
  }

  const fieldConfidence: Record<string, number> = {}
  if (isRecord(source.fieldConfidence)) {
    for (const field of AI_INVOICE_OCR_FIELDS) {
      const value = numericValue(source.fieldConfidence[field])
      if (typeof value === 'number') fieldConfidence[field] = value
    }
  }
  const confidence = numericValue(source.confidence)
  const warnings = Array.isArray(source.warnings) ? source.warnings : []
  const confidenceMissing = typeof confidence !== 'number'

  return {
    ...source,
    rawText: normalizeOcrRawText(source.rawText),
    invoice,
    confidence: confidenceMissing ? 0 : confidence,
    fieldConfidence,
    warnings: confidenceMissing
      ? ['AI 服务未返回置信度，识别结果必须人工复核。', ...warnings]
      : warnings
  }
}

function textValue(value: unknown, maxLength = 300): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const normalized = Number(value)
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null
}

function confidenceValue(value: unknown): number {
  return Math.min(1, Math.max(0, numberValue(value) ?? 0))
}

function stringArray(value: unknown, maxItems = 20): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => textValue(item, 500))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems)
}

function normalizeDate(value: unknown): string | null {
  const source = textValue(value, 40)
  if (!source) return null
  const match = source.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/)
  if (!match) return null
  const month = match[2].padStart(2, '0')
  const day = match[3].padStart(2, '0')
  const normalized = `${match[1]}-${month}-${day}`
  const date = new Date(`${normalized}T00:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized
    ? null
    : normalized
}

function normalizeInvoiceType(value: unknown): string | null {
  const source = textValue(value, 40)
  if (!source) return null
  const aliases: Record<string, string> = {
    '增值税专用发票': 'vat_special',
    '增值税普通发票': 'vat_ordinary',
    '电子发票': 'electronic'
  }
  const normalized = aliases[source] ?? source
  return INVOICE_TYPES.has(normalized) ? normalized : null
}

function normalizeInvoiceNo(value: unknown): string | null {
  const source = textValue(value, 100)?.replace(/\s+/g, '').toUpperCase()
  if (!source) return null
  return /^[A-Z0-9]{6,30}$/.test(source) ? source : null
}

export function validateAiInvoiceOcrProviderPayload(payload: unknown): ContractValidationResult {
  const errors: string[] = []
  if (!isRecord(payload)) return { valid: false, errors: ['payload must be an object'] }
  if (!isRecord(payload.invoice)) errors.push('invoice must be an object')

  const confidence = payload.confidence
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    errors.push('confidence must be between 0 and 1')
  }
  if (!isRecord(payload.fieldConfidence)) {
    errors.push('fieldConfidence must be an object')
  } else {
    for (const [key, value] of Object.entries(payload.fieldConfidence)) {
      if (!AI_INVOICE_OCR_FIELDS.includes(key as AiInvoiceOcrField)) {
        errors.push(`fieldConfidence.${key} is not supported`)
      } else if (typeof value !== 'number' || value < 0 || value > 1) {
        errors.push(`fieldConfidence.${key} must be between 0 and 1`)
      }
    }
  }

  if (isRecord(payload.invoice)) {
    for (const field of MONEY_FIELDS) {
      const value = payload.invoice[field]
      if (value !== null && value !== undefined && (typeof value !== 'number' || value < 0)) {
        errors.push(`invoice.${field} must be a non-negative number or null`)
      }
    }
    const invoiceType = payload.invoice.invoiceType
    if (invoiceType !== null && invoiceType !== undefined && typeof invoiceType !== 'string') {
      errors.push('invoice.invoiceType must be a string or null')
    }
    const issueDate = payload.invoice.issueDate
    if (issueDate !== null && issueDate !== undefined && typeof issueDate !== 'string') {
      errors.push('invoice.issueDate must be a string or null')
    }
  }
  return { valid: errors.length === 0, errors }
}

export function normalizeAiInvoiceOcrResponse(
  payload: Record<string, unknown>
): AiInvoiceOcrNormalizedResponse {
  const source = isRecord(payload.invoice) ? payload.invoice : {}
  const sourceInvoiceNo = textValue(source.invoiceNo, 100)
  const invoice = {
    invoiceType: normalizeInvoiceType(source.invoiceType),
    invoiceTitle: textValue(source.invoiceTitle),
    taxNumber: textValue(source.taxNumber, 100),
    invoiceCode: textValue(source.invoiceCode, 100),
    invoiceNo: normalizeInvoiceNo(source.invoiceNo),
    issueDate: normalizeDate(source.issueDate),
    taxRate: numberValue(source.taxRate),
    amountExcludingTax: numberValue(source.amountExcludingTax),
    taxAmount: numberValue(source.taxAmount),
    totalAmount: numberValue(source.totalAmount),
    buyerName: textValue(source.buyerName),
    buyerTaxNumber: textValue(source.buyerTaxNumber, 100),
    sellerName: textValue(source.sellerName),
    sellerTaxNumber: textValue(source.sellerTaxNumber, 100)
  } satisfies AiInvoiceOcrDraft

  const fieldConfidence: Partial<Record<AiInvoiceOcrField, number>> = {}
  if (isRecord(payload.fieldConfidence)) {
    for (const field of AI_INVOICE_OCR_FIELDS) {
      if (payload.fieldConfidence[field] !== undefined) {
        fieldConfidence[field] = confidenceValue(payload.fieldConfidence[field])
      }
    }
  }

  const missingFields: string[] = []
  const requiredFields: Array<[AiInvoiceOcrField, string]> = [
    ['invoiceNo', '发票号码'],
    ['issueDate', '开票日期'],
    ['totalAmount', '价税合计']
  ]
  for (const [field, label] of requiredFields) {
    if (invoice[field] === null) missingFields.push(label)
  }

  const warnings = stringArray(payload.warnings)
  if (sourceInvoiceNo && !invoice.invoiceNo) {
    warnings.unshift('识别到的发票号码格式异常，已留空，请根据票面补录。')
  }
  const calculatedTotal =
    invoice.amountExcludingTax !== null && invoice.taxAmount !== null
      ? Math.round((invoice.amountExcludingTax + invoice.taxAmount) * 100) / 100
      : null
  if (
    calculatedTotal !== null &&
    invoice.totalAmount !== null &&
    Math.abs(calculatedTotal - invoice.totalAmount) > 0.02
  ) {
    warnings.unshift('识别金额勾稽不一致：不含税金额与税额之和不等于价税合计。')
  }

  return {
    rawText: normalizeOcrRawText(payload.rawText),
    summary: textValue(payload.summary, 500) ?? '已完成发票票面识别，请人工核对后应用。',
    confidence: confidenceValue(payload.confidence),
    fieldConfidence,
    missingFields,
    warnings: [...new Set(warnings)],
    invoice
  }
}

function comparable(value: unknown): string {
  if (typeof value === 'number') return value.toFixed(2)
  return String(value ?? '').trim()
}

export function compareAiInvoiceOcrPayloads(
  proposed: Record<string, unknown>,
  finalPayload: Record<string, unknown>
): { acceptedFields: string[]; correctedFields: string[] } {
  const acceptedFields: string[] = []
  const correctedFields: string[] = []
  for (const field of AI_INVOICE_OCR_APPLIED_FIELDS) {
    const proposedValue = proposed[field]
    if (proposedValue === null || proposedValue === undefined || proposedValue === '') continue
    if (comparable(proposedValue) === comparable(finalPayload[field])) acceptedFields.push(field)
    else correctedFields.push(field)
  }
  return { acceptedFields, correctedFields }
}
