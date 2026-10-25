import { normalizeOcrRawText } from './ai-ocr-text.ts'

export const AI_WAYBILL_EXPENSE_FIELDS = [
  'amount',
  'occurredOn',
  'quantity',
  'unitPrice',
  'providerName',
  'payeeName',
  'paymentChannel',
  'invoiceNo',
  'meterNo',
  'expenseLocation',
  'remark'
] as const

export type AiWaybillExpenseField = (typeof AI_WAYBILL_EXPENSE_FIELDS)[number]

export interface AiWaybillExpenseDraft {
  amount: number | null
  occurredOn: string | null
  quantity: number | null
  unitPrice: number | null
  providerName: string | null
  payeeName: string | null
  paymentChannel: string | null
  invoiceNo: string | null
  meterNo: string | null
  expenseLocation: string | null
  remark: string | null
}

export interface AiWaybillExpenseNormalizedResponse {
  rawText: string
  summary: string
  confidence: number
  fieldConfidence: Partial<Record<AiWaybillExpenseField, number>>
  missingFields: string[]
  warnings: string[]
  expense: AiWaybillExpenseDraft
}

interface ContractValidationResult {
  valid: boolean
  errors: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function textValue(value: unknown, maxLength = 500): string | null {
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
  const normalized = Number(value)
  return Number.isFinite(normalized) ? Math.min(1, Math.max(0, normalized)) : 0
}

function normalizeDate(value: unknown): string | null {
  const source = textValue(value, 40)
  if (!source) return null
  const match = source.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/)
  if (!match) return null
  const normalized = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  const parsed = new Date(`${normalized}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized
    ? null
    : normalized
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => textValue(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 20)
}

export function validateAiWaybillExpensePayload(payload: unknown): ContractValidationResult {
  const errors: string[] = []
  if (!isRecord(payload)) return { valid: false, errors: ['payload must be an object'] }
  if (!isRecord(payload.expense)) errors.push('expense must be an object')
  if (typeof payload.confidence !== 'number' || payload.confidence < 0 || payload.confidence > 1) {
    errors.push('confidence must be between 0 and 1')
  }
  if (!isRecord(payload.fieldConfidence)) errors.push('fieldConfidence must be an object')
  if (isRecord(payload.expense)) {
    for (const field of ['amount', 'quantity', 'unitPrice'] as const) {
      const value = payload.expense[field]
      if (value !== null && value !== undefined && (typeof value !== 'number' || value < 0)) {
        errors.push(`expense.${field} must be a non-negative number or null`)
      }
    }
  }
  return { valid: errors.length === 0, errors }
}

export function normalizeAiWaybillExpenseResponse(
  payload: Record<string, unknown>
): AiWaybillExpenseNormalizedResponse {
  const source = isRecord(payload.expense) ? payload.expense : {}
  const expense: AiWaybillExpenseDraft = {
    amount: numberValue(source.amount),
    occurredOn: normalizeDate(source.occurredOn),
    quantity: numberValue(source.quantity),
    unitPrice: numberValue(source.unitPrice),
    providerName: textValue(source.providerName, 200),
    payeeName: textValue(source.payeeName, 200),
    paymentChannel: textValue(source.paymentChannel, 80),
    invoiceNo: textValue(source.invoiceNo, 120),
    meterNo: textValue(source.meterNo, 120),
    expenseLocation: textValue(source.expenseLocation, 300),
    remark: textValue(source.remark, 500)
  }
  const fieldConfidence: Partial<Record<AiWaybillExpenseField, number>> = {}
  if (isRecord(payload.fieldConfidence)) {
    for (const field of AI_WAYBILL_EXPENSE_FIELDS) {
      if (payload.fieldConfidence[field] !== undefined) {
        fieldConfidence[field] = confidenceValue(payload.fieldConfidence[field])
      }
    }
  }
  const missingFields: string[] = []
  if (expense.amount === null) missingFields.push('费用金额')
  if (!expense.occurredOn) missingFields.push('发生日期')
  return {
    rawText: normalizeOcrRawText(payload.rawText),
    summary: textValue(payload.summary) ?? '运单费用票据识别完成，请核对后应用。',
    confidence: confidenceValue(payload.confidence),
    fieldConfidence,
    missingFields,
    warnings: [...new Set(stringArray(payload.warnings))],
    expense
  }
}

function comparable(value: unknown): string {
  if (typeof value === 'number') return value.toFixed(4)
  return String(value ?? '').trim()
}

export function compareAiWaybillExpensePayloads(
  proposed: Record<string, unknown>,
  finalPayload: Record<string, unknown>
): { acceptedFields: string[]; correctedFields: string[] } {
  const acceptedFields: string[] = []
  const correctedFields: string[] = []
  for (const field of AI_WAYBILL_EXPENSE_FIELDS) {
    const value = proposed[field]
    if (value === null || value === undefined || value === '') continue
    if (comparable(value) === comparable(finalPayload[field])) acceptedFields.push(field)
    else correctedFields.push(field)
  }
  return { acceptedFields, correctedFields }
}

