import { normalizeOcrRawText } from './ai-ocr-text.ts'
import {
  isOcrRecord,
  normalizeOcrConfidence,
  normalizeOcrDate,
  normalizeOcrNonNegativeNumber,
  normalizeOcrStringArray,
  normalizeOcrTextValue
} from './ai-ocr-values.ts'

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

export function validateAiWaybillExpensePayload(payload: unknown): ContractValidationResult {
  const errors: string[] = []
  if (!isOcrRecord(payload)) return { valid: false, errors: ['payload must be an object'] }
  if (!isOcrRecord(payload.expense)) errors.push('expense must be an object')
  if (typeof payload.confidence !== 'number' || payload.confidence < 0 || payload.confidence > 1) {
    errors.push('confidence must be between 0 and 1')
  }
  if (!isOcrRecord(payload.fieldConfidence)) errors.push('fieldConfidence must be an object')
  if (isOcrRecord(payload.expense)) {
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
  const source = isOcrRecord(payload.expense) ? payload.expense : {}
  const expense: AiWaybillExpenseDraft = {
    amount: normalizeOcrNonNegativeNumber(source.amount),
    occurredOn: normalizeOcrDate(source.occurredOn),
    quantity: normalizeOcrNonNegativeNumber(source.quantity),
    unitPrice: normalizeOcrNonNegativeNumber(source.unitPrice),
    providerName: normalizeOcrTextValue(source.providerName, 200),
    payeeName: normalizeOcrTextValue(source.payeeName, 200),
    paymentChannel: normalizeOcrTextValue(source.paymentChannel, 80),
    invoiceNo: normalizeOcrTextValue(source.invoiceNo, 120),
    meterNo: normalizeOcrTextValue(source.meterNo, 120),
    expenseLocation: normalizeOcrTextValue(source.expenseLocation, 300),
    remark: normalizeOcrTextValue(source.remark, 500)
  }
  const fieldConfidence: Partial<Record<AiWaybillExpenseField, number>> = {}
  if (isOcrRecord(payload.fieldConfidence)) {
    for (const field of AI_WAYBILL_EXPENSE_FIELDS) {
      if (payload.fieldConfidence[field] !== undefined) {
        fieldConfidence[field] = normalizeOcrConfidence(payload.fieldConfidence[field])
      }
    }
  }
  const missingFields: string[] = []
  if (expense.amount === null) missingFields.push('费用金额')
  if (!expense.occurredOn) missingFields.push('发生日期')
  return {
    rawText: normalizeOcrRawText(payload.rawText),
    summary: normalizeOcrTextValue(payload.summary) ?? '运单费用票据识别完成，请核对后应用。',
    confidence: normalizeOcrConfidence(payload.confidence),
    fieldConfidence,
    missingFields,
    warnings: [...new Set(normalizeOcrStringArray(payload.warnings))],
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
