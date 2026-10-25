import { normalizeOcrRawText } from './ai-ocr-text.ts'

export const AI_WAYBILL_RECEIPT_FIELDS = [
  'waybillNo',
  'signerName',
  'signedAt',
  'deliveryResult',
  'signedQuantity',
  'damagedQuantity',
  'shortageQuantity',
  'exceptionNote'
] as const

export type AiWaybillReceiptField = (typeof AI_WAYBILL_RECEIPT_FIELDS)[number]
export type AiWaybillReceiptDeliveryResult =
  | 'normal'
  | 'damaged'
  | 'shortage'
  | 'refused'
  | 'partial'
  | 'unclear'
export type AiWaybillReceiptRiskLevel = 'none' | 'medium' | 'high' | 'critical'

export interface AiWaybillReceiptDraft {
  waybillNo: string | null
  signerName: string | null
  signedAt: string | null
  deliveryResult: AiWaybillReceiptDeliveryResult
  signedQuantity: number | null
  damagedQuantity: number | null
  shortageQuantity: number | null
  exceptionNote: string | null
}

export interface AiWaybillReceiptExpectedOrder {
  orderNo: string
  receiverName?: string | null
  plannedArrivalTime?: string | null
  cargoQuantityTotal?: number | null
}

export interface AiWaybillReceiptSignal {
  type: string
  severity: Exclude<AiWaybillReceiptRiskLevel, 'none'>
  title: string
  detail: string
}

export interface AiWaybillReceiptNormalizedResponse {
  rawText: string
  summary: string
  confidence: number
  fieldConfidence: Partial<Record<AiWaybillReceiptField, number>>
  missingFields: string[]
  warnings: string[]
  receipt: AiWaybillReceiptDraft
}

export interface AiWaybillReceiptAssessment {
  riskLevel: AiWaybillReceiptRiskLevel
  matched: boolean
  signals: AiWaybillReceiptSignal[]
  recommendedAction: 'normal_review' | 'manual_review' | 'block_completion'
}

export interface ContractValidationResult {
  valid: boolean
  errors: string[]
}

const DELIVERY_RESULTS = new Set<AiWaybillReceiptDeliveryResult>([
  'normal',
  'damaged',
  'shortage',
  'refused',
  'partial',
  'unclear'
])
const NUMBER_FIELDS = ['signedQuantity', 'damagedQuantity', 'shortageQuantity'] as const

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

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => textValue(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 20)
}

function normalizedReference(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s\-_/()（）]/g, '')
}

function normalizeDateTime(value: unknown): string | null {
  const source = textValue(value, 80)
  if (!source) return null
  const normalized = new Date(source)
  return Number.isNaN(normalized.getTime()) ? null : normalized.toISOString()
}

function normalizeDeliveryResult(value: unknown): AiWaybillReceiptDeliveryResult {
  const source = textValue(value, 40) as AiWaybillReceiptDeliveryResult | null
  return source && DELIVERY_RESULTS.has(source) ? source : 'unclear'
}

export function validateAiWaybillReceiptProviderPayload(
  payload: unknown
): ContractValidationResult {
  const errors: string[] = []
  if (!isRecord(payload)) return { valid: false, errors: ['payload must be an object'] }
  if (!isRecord(payload.receipt)) errors.push('receipt must be an object')
  if (typeof payload.confidence !== 'number' || payload.confidence < 0 || payload.confidence > 1) {
    errors.push('confidence must be between 0 and 1')
  }
  if (!isRecord(payload.fieldConfidence)) {
    errors.push('fieldConfidence must be an object')
  } else {
    for (const [field, value] of Object.entries(payload.fieldConfidence)) {
      if (!AI_WAYBILL_RECEIPT_FIELDS.includes(field as AiWaybillReceiptField)) {
        errors.push(`fieldConfidence.${field} is not supported`)
      } else if (typeof value !== 'number' || value < 0 || value > 1) {
        errors.push(`fieldConfidence.${field} must be between 0 and 1`)
      }
    }
  }
  if (isRecord(payload.receipt)) {
    const result = payload.receipt.deliveryResult
    if (typeof result !== 'string' || !DELIVERY_RESULTS.has(result as AiWaybillReceiptDeliveryResult)) {
      errors.push('receipt.deliveryResult is invalid')
    }
    for (const field of NUMBER_FIELDS) {
      const value = payload.receipt[field]
      if (value !== null && value !== undefined && (typeof value !== 'number' || value < 0)) {
        errors.push(`receipt.${field} must be a non-negative number or null`)
      }
    }
  }
  return { valid: errors.length === 0, errors }
}

export function normalizeAiWaybillReceiptResponse(
  payload: Record<string, unknown>
): AiWaybillReceiptNormalizedResponse {
  const source = isRecord(payload.receipt) ? payload.receipt : {}
  const receipt: AiWaybillReceiptDraft = {
    waybillNo: textValue(source.waybillNo, 120),
    signerName: textValue(source.signerName, 120),
    signedAt: normalizeDateTime(source.signedAt),
    deliveryResult: normalizeDeliveryResult(source.deliveryResult),
    signedQuantity: numberValue(source.signedQuantity),
    damagedQuantity: numberValue(source.damagedQuantity),
    shortageQuantity: numberValue(source.shortageQuantity),
    exceptionNote: textValue(source.exceptionNote, 1000)
  }
  const fieldConfidence: Partial<Record<AiWaybillReceiptField, number>> = {}
  if (isRecord(payload.fieldConfidence)) {
    for (const field of AI_WAYBILL_RECEIPT_FIELDS) {
      if (payload.fieldConfidence[field] !== undefined) {
        fieldConfidence[field] = confidenceValue(payload.fieldConfidence[field])
      }
    }
  }
  const missingFields: string[] = []
  if (!receipt.waybillNo) missingFields.push('运单号')
  if (!receipt.signerName) missingFields.push('签收人')
  if (!receipt.signedAt) missingFields.push('签收时间')
  return {
    rawText: normalizeOcrRawText(payload.rawText),
    summary: textValue(payload.summary) ?? '回单识别完成，请核对后确认签收。',
    confidence: confidenceValue(payload.confidence),
    fieldConfidence,
    missingFields,
    warnings: [...new Set(stringArray(payload.warnings))],
    receipt
  }
}

export function assessAiWaybillReceipt(
  receipt: AiWaybillReceiptDraft,
  expected: AiWaybillReceiptExpectedOrder
): AiWaybillReceiptAssessment {
  const signals: AiWaybillReceiptSignal[] = []
  const expectedNo = normalizedReference(expected.orderNo)
  const detectedNo = normalizedReference(receipt.waybillNo)
  const matched = Boolean(expectedNo && detectedNo && expectedNo === detectedNo)
  if (!receipt.waybillNo) {
    signals.push({
      type: 'missing_waybill_no',
      severity: 'high',
      title: '回单未识别到运单号',
      detail: '无法确认回单是否属于当前运单，必须人工核验。'
    })
  } else if (!matched) {
    signals.push({
      type: 'waybill_no_mismatch',
      severity: 'critical',
      title: '回单运单号不一致',
      detail: `识别为 ${receipt.waybillNo}，当前运单为 ${expected.orderNo}。`
    })
  }

  const resultSignals: Partial<Record<AiWaybillReceiptDeliveryResult, AiWaybillReceiptSignal>> = {
    damaged: {
      type: 'cargo_damaged',
      severity: 'high',
      title: '检测到货损',
      detail: receipt.exceptionNote || '回单包含破损或货损信息。'
    },
    shortage: {
      type: 'cargo_shortage',
      severity: 'high',
      title: '检测到少货',
      detail: receipt.exceptionNote || '回单包含少货或数量不足信息。'
    },
    refused: {
      type: 'delivery_refused',
      severity: 'critical',
      title: '检测到拒收',
      detail: receipt.exceptionNote || '回单显示收货方拒收。'
    },
    partial: {
      type: 'partial_delivery',
      severity: 'high',
      title: '检测到部分签收',
      detail: receipt.exceptionNote || '回单显示仅部分货物完成签收。'
    },
    unclear: {
      type: 'unclear_delivery_result',
      severity: 'medium',
      title: '签收结论不清晰',
      detail: '回单签收结论模糊，需要人工确认。'
    }
  }
  const resultSignal = resultSignals[receipt.deliveryResult]
  if (resultSignal) signals.push(resultSignal)

  const expectedQuantity = numberValue(expected.cargoQuantityTotal)
  if (
    expectedQuantity !== null &&
    receipt.signedQuantity !== null &&
    receipt.signedQuantity < expectedQuantity
  ) {
    signals.push({
      type: 'quantity_mismatch',
      severity: 'high',
      title: '签收数量少于运单数量',
      detail: `运单数量 ${expectedQuantity}，回单签收数量 ${receipt.signedQuantity}。`
    })
  }

  if (receipt.signedAt && expected.plannedArrivalTime) {
    const signedAt = new Date(receipt.signedAt).getTime()
    const plannedAt = new Date(expected.plannedArrivalTime).getTime()
    if (Number.isFinite(signedAt) && Number.isFinite(plannedAt) && signedAt < plannedAt - 86_400_000) {
      signals.push({
        type: 'signed_too_early',
        severity: 'medium',
        title: '签收时间明显早于计划到达',
        detail: '识别的签收时间比计划到达时间早超过 24 小时。'
      })
    }
  }

  const severityOrder: Record<AiWaybillReceiptRiskLevel, number> = {
    none: 0,
    medium: 1,
    high: 2,
    critical: 3
  }
  const riskLevel = signals.reduce<AiWaybillReceiptRiskLevel>(
    (highest, signal) =>
      severityOrder[signal.severity] > severityOrder[highest] ? signal.severity : highest,
    'none'
  )
  return {
    riskLevel,
    matched,
    signals,
    recommendedAction:
      riskLevel === 'critical'
        ? 'block_completion'
        : riskLevel === 'high' || riskLevel === 'medium'
          ? 'manual_review'
          : 'normal_review'
  }
}

function comparable(value: unknown): string {
  if (typeof value === 'number') return value.toFixed(2)
  return String(value ?? '').trim()
}

export function compareAiWaybillReceiptPayloads(
  proposed: Record<string, unknown>,
  finalPayload: Record<string, unknown>
): { acceptedFields: string[]; correctedFields: string[] } {
  const acceptedFields: string[] = []
  const correctedFields: string[] = []
  for (const field of AI_WAYBILL_RECEIPT_FIELDS) {
    const value = proposed[field]
    if (value === null || value === undefined || value === '') continue
    if (comparable(value) === comparable(finalPayload[field])) acceptedFields.push(field)
    else correctedFields.push(field)
  }
  return { acceptedFields, correctedFields }
}
