import { normalizeOcrRawText } from './ai-ocr-text.ts'
import {
  isOcrRecord as isRecord,
  normalizeOcrConfidence as confidenceValue,
  normalizeOcrDate as dateValue,
  normalizeOcrStringArray as stringArray,
  normalizeOcrTextValue as textValue
} from './ai-ocr-values.ts'

export const AI_SMIS_CERTIFICATE_FIELDS = [
  'certificateNumber',
  'issuingAuthority',
  'archiveNumber',
  'approvalDate',
  'effectiveDate'
] as const

export type AiSmisCertificateField = (typeof AI_SMIS_CERTIFICATE_FIELDS)[number]

export interface AiSmisCertificateDraft {
  holderName: string | null
  certificateNumber: string | null
  issuingAuthority: string | null
  archiveNumber: string | null
  approvalDate: string | null
  effectiveDate: string | null
  workItemCodes: string[]
}

export interface AiSmisCertificateNormalizedResponse {
  rawText: string
  summary: string
  confidence: number
  fieldConfidence: Partial<Record<AiSmisCertificateField, number>>
  missingFields: string[]
  warnings: string[]
  certificate: AiSmisCertificateDraft
}

export function validateAiSmisCertificatePayload(payload: unknown) {
  const errors: string[] = []
  if (!isRecord(payload)) return { valid: false, errors: ['payload must be an object'] }
  if (!isRecord(payload.certificate)) errors.push('certificate must be an object')
  if (typeof payload.confidence !== 'number' || payload.confidence < 0 || payload.confidence > 1) {
    errors.push('confidence must be between 0 and 1')
  }
  if (!isRecord(payload.fieldConfidence)) errors.push('fieldConfidence must be an object')
  return { valid: errors.length === 0, errors }
}

export function normalizeAiSmisCertificateResponse(
  payload: Record<string, unknown>
): AiSmisCertificateNormalizedResponse {
  const source = isRecord(payload.certificate) ? payload.certificate : {}
  const certificate: AiSmisCertificateDraft = {
    holderName: textValue(source.holderName, 100),
    certificateNumber: textValue(source.certificateNumber, 160),
    issuingAuthority: textValue(source.issuingAuthority, 200),
    archiveNumber: textValue(source.archiveNumber, 160),
    approvalDate: dateValue(source.approvalDate),
    effectiveDate: dateValue(source.effectiveDate),
    workItemCodes: [...new Set(stringArray(source.workItemCodes))].slice(0, 16)
  }
  const fieldConfidence: Partial<Record<AiSmisCertificateField, number>> = {}
  if (isRecord(payload.fieldConfidence)) {
    for (const field of AI_SMIS_CERTIFICATE_FIELDS) {
      if (payload.fieldConfidence[field] !== undefined) {
        fieldConfidence[field] = confidenceValue(payload.fieldConfidence[field])
      }
    }
  }
  const missingFields: string[] = []
  if (!certificate.certificateNumber) missingFields.push('证件编号')
  if (!certificate.approvalDate) missingFields.push('批准/发证日期')
  if (!certificate.effectiveDate) missingFields.push('有效日期')
  return {
    rawText: normalizeOcrRawText(payload.rawText),
    summary: textValue(payload.summary, 500) ?? '证件识别完成，请人工核对后应用。',
    confidence: confidenceValue(payload.confidence),
    fieldConfidence,
    missingFields,
    warnings: [...new Set(stringArray(payload.warnings))],
    certificate
  }
}

export function compareAiSmisCertificatePayloads(
  proposed: Record<string, unknown>,
  finalPayload: Record<string, unknown>
): { acceptedFields: string[]; correctedFields: string[] } {
  const acceptedFields: string[] = []
  const correctedFields: string[] = []
  for (const field of AI_SMIS_CERTIFICATE_FIELDS) {
    const value = proposed[field]
    if (value === null || value === undefined || value === '') continue
    if (String(value).trim() === String(finalPayload[field] ?? '').trim()) acceptedFields.push(field)
    else correctedFields.push(field)
  }
  return { acceptedFields, correctedFields }
}
