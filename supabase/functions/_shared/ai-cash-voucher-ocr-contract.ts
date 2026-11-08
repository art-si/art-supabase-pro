import { normalizeOcrRawText } from './ai-ocr-text.ts'
import {
  normalizeOcrConfidence,
  normalizeOcrDate,
  normalizeOcrNonNegativeNumber,
  normalizeOcrStringArray,
  normalizeOcrTextValue
} from './ai-ocr-values.ts'

export const AI_CASH_VOUCHER_FIELDS = [
  'payerName',
  'payeeName',
  'transactionDate',
  'amount',
  'bankReference',
  'paymentMethod'
] as const

export type AiCashVoucherField = (typeof AI_CASH_VOUCHER_FIELDS)[number]
export type AiCashVoucherDirection = 'receipt' | 'payment'

export interface AiCashVoucherDraft {
  payerName: string | null
  payeeName: string | null
  transactionDate: string | null
  amount: number | null
  bankReference: string | null
  paymentMethod: 'bank_transfer' | 'cash' | 'wechat' | 'alipay' | 'other'
}

export interface AiCashVoucherNormalizedResponse {
  rawText: string
  summary: string
  confidence: number
  fieldConfidence: Partial<Record<AiCashVoucherField, number>>
  missingFields: string[]
  warnings: string[]
  voucher: AiCashVoucherDraft
}

export interface AiCashVoucherStatementCandidate {
  statementId: string
  statementNo: string
  counterpartyId: string
  counterpartyName: string
  periodStart: string
  periodEnd: string
  statementAmount: number
  settledAmount: number
  outstandingAmount: number
  createTime?: string | null
}

export interface AiCashVoucherStatementMatch extends AiCashVoucherStatementCandidate {
  score: number
  confidence: number
  recommendedAllocation: number
  reasons: string[]
}

export interface ContractValidationResult {
  valid: boolean
  errors: string[]
}

const PAYMENT_METHODS = new Set(['bank_transfer', 'cash', 'wechat', 'alipay', 'other'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizePaymentMethod(value: unknown): AiCashVoucherDraft['paymentMethod'] {
  const source = normalizeOcrTextValue(value, 40)
  return source && PAYMENT_METHODS.has(source)
    ? (source as AiCashVoucherDraft['paymentMethod'])
    : 'bank_transfer'
}

function normalizedText(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s\-_/()（）·.,，。]/g, '')
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function validateAiCashVoucherProviderPayload(payload: unknown): ContractValidationResult {
  const errors: string[] = []
  if (!isRecord(payload)) return { valid: false, errors: ['payload must be an object'] }
  if (!isRecord(payload.voucher)) errors.push('voucher must be an object')
  if (typeof payload.confidence !== 'number' || payload.confidence < 0 || payload.confidence > 1) {
    errors.push('confidence must be between 0 and 1')
  }
  if (!isRecord(payload.fieldConfidence)) {
    errors.push('fieldConfidence must be an object')
  } else {
    for (const [field, value] of Object.entries(payload.fieldConfidence)) {
      if (!AI_CASH_VOUCHER_FIELDS.includes(field as AiCashVoucherField)) {
        errors.push(`fieldConfidence.${field} is not supported`)
      } else if (typeof value !== 'number' || value < 0 || value > 1) {
        errors.push(`fieldConfidence.${field} must be between 0 and 1`)
      }
    }
  }
  if (isRecord(payload.voucher)) {
    const amount = payload.voucher.amount
    if (amount !== null && amount !== undefined && (typeof amount !== 'number' || amount < 0)) {
      errors.push('voucher.amount must be a non-negative number or null')
    }
    const paymentMethod = payload.voucher.paymentMethod
    if (typeof paymentMethod !== 'string' || !PAYMENT_METHODS.has(paymentMethod)) {
      errors.push('voucher.paymentMethod is invalid')
    }
  }
  return { valid: errors.length === 0, errors }
}

export function normalizeAiCashVoucherResponse(
  payload: Record<string, unknown>
): AiCashVoucherNormalizedResponse {
  const source = isRecord(payload.voucher) ? payload.voucher : {}
  const voucher: AiCashVoucherDraft = {
    payerName: normalizeOcrTextValue(source.payerName, 300),
    payeeName: normalizeOcrTextValue(source.payeeName, 300),
    transactionDate: normalizeOcrDate(source.transactionDate),
    amount: normalizeOcrNonNegativeNumber(source.amount),
    bankReference: normalizeOcrTextValue(source.bankReference, 160),
    paymentMethod: normalizePaymentMethod(source.paymentMethod)
  }
  const fieldConfidence: Partial<Record<AiCashVoucherField, number>> = {}
  if (isRecord(payload.fieldConfidence)) {
    for (const field of AI_CASH_VOUCHER_FIELDS) {
      if (payload.fieldConfidence[field] !== undefined) {
        fieldConfidence[field] = normalizeOcrConfidence(payload.fieldConfidence[field])
      }
    }
  }
  const missingFields: string[] = []
  if (!voucher.transactionDate) missingFields.push('交易日期')
  if (voucher.amount === null) missingFields.push('交易金额')
  if (!voucher.payerName && !voucher.payeeName) missingFields.push('付款方/收款方')
  return {
    rawText: normalizeOcrRawText(payload.rawText),
    summary: normalizeOcrTextValue(payload.summary) ?? '付款凭证识别完成，请核对后应用。',
    confidence: normalizeOcrConfidence(payload.confidence),
    fieldConfidence,
    missingFields,
    warnings: [...new Set(normalizeOcrStringArray(payload.warnings))],
    voucher
  }
}

export function matchAiCashVoucherStatements(
  voucher: AiCashVoucherDraft,
  direction: AiCashVoucherDirection,
  candidates: AiCashVoucherStatementCandidate[]
): AiCashVoucherStatementMatch[] {
  const counterpartyName = direction === 'receipt' ? voucher.payerName : voucher.payeeName
  const normalizedCounterparty = normalizedText(counterpartyName)
  const normalizedReference = normalizedText(voucher.bankReference)

  return candidates
    .map((candidate) => {
      let score = 0
      const reasons: string[] = []
      const outstanding = Math.max(0, Number(candidate.outstandingAmount || 0))
      if (voucher.amount !== null && voucher.amount > 0 && outstanding > 0) {
        const difference = Math.abs(voucher.amount - outstanding)
        const ratio = difference / Math.max(voucher.amount, outstanding)
        if (difference <= 0.01) {
          score += 50
          reasons.push('凭证金额与未结金额一致')
        } else if (ratio <= 0.05) {
          score += 38
          reasons.push('凭证金额与未结金额接近')
        } else if (voucher.amount <= outstanding) {
          score += 24
          reasons.push('未结金额可以覆盖本次凭证')
        }
      }

      const candidateName = normalizedText(candidate.counterpartyName)
      if (normalizedCounterparty && candidateName) {
        if (normalizedCounterparty === candidateName) {
          score += 30
          reasons.push('往来单位名称一致')
        } else if (
          normalizedCounterparty.includes(candidateName) ||
          candidateName.includes(normalizedCounterparty)
        ) {
          score += 22
          reasons.push('往来单位名称高度相似')
        }
      }

      if (voucher.transactionDate) {
        const date = voucher.transactionDate
        if (date >= candidate.periodStart && date <= candidate.periodEnd) {
          score += 12
          reasons.push('交易日期位于对账账期内')
        } else if (date >= candidate.periodEnd) {
          score += 6
          reasons.push('交易日期晚于对账账期')
        }
      }

      const statementNo = normalizedText(candidate.statementNo)
      if (normalizedReference && statementNo && normalizedReference.includes(statementNo)) {
        score += 8
        reasons.push('凭证附言包含对账单号')
      }

      const boundedScore = Math.min(100, score)
      return {
        ...candidate,
        score: boundedScore,
        confidence: Math.round((boundedScore / 100) * 100) / 100,
        recommendedAllocation: roundMoney(
          Math.min(Math.max(voucher.amount ?? 0, 0), Math.max(outstanding, 0))
        ),
        reasons
      }
    })
    .filter((candidate) => candidate.score >= 30)
    .sort(
      (left, right) => right.score - left.score || right.outstandingAmount - left.outstandingAmount
    )
    .slice(0, 5)
}

function comparable(value: unknown): string {
  if (typeof value === 'number') return value.toFixed(2)
  return String(value ?? '').trim()
}

export function compareAiCashVoucherPayloads(
  proposed: Record<string, unknown>,
  finalPayload: Record<string, unknown>
): { acceptedFields: string[]; correctedFields: string[] } {
  const acceptedFields: string[] = []
  const correctedFields: string[] = []
  for (const field of AI_CASH_VOUCHER_FIELDS) {
    const value = proposed[field]
    if (value === null || value === undefined || value === '') continue
    if (comparable(value) === comparable(finalPayload[field])) acceptedFields.push(field)
    else correctedFields.push(field)
  }
  return { acceptedFields, correctedFields }
}
