import { normalizeOcrRawText } from './ai-ocr-text.ts'
import {
  isOcrRecord,
  normalizeOcrConfidence,
  normalizeOcrDate,
  normalizeOcrStringArray,
  normalizeOcrTextValue
} from './ai-ocr-values.ts'

export const DRIVER_OCR_FIELDS = [
  'driverName', 'idCardNo', 'gender', 'birthDate', 'ethnicity', 'homeAddress',
  'homeAddressDetail', 'idCardIssuer', 'idCardValidFrom', 'idCardValidTo',
  'licenseArchiveNo', 'licenseClasses', 'licenseIssuer', 'licenseValidFrom',
  'licenseExpireDate', 'qualificationType', 'qualificationNo', 'qualificationValidTo'
] as const

export type DriverOcrField = (typeof DRIVER_OCR_FIELDS)[number]
export type DriverOcrDocumentType = 'identity' | 'license' | 'qualification'
export type DriverOcrImageSide =
  | 'idCardFrontUrl' | 'idCardBackUrl' | 'driverLicenseFrontUrl'
  | 'driverLicenseBackUrl' | 'licenseBackExtraUrl' | 'qualificationFrontUrl'
  | 'qualificationAssessmentUrl'

export const DRIVER_OCR_IMAGE_TYPES: Record<DriverOcrImageSide, DriverOcrDocumentType> = {
  idCardFrontUrl: 'identity', idCardBackUrl: 'identity',
  driverLicenseFrontUrl: 'license', driverLicenseBackUrl: 'license',
  licenseBackExtraUrl: 'license', qualificationFrontUrl: 'qualification',
  qualificationAssessmentUrl: 'qualification'
}

const DATE_FIELDS: readonly DriverOcrField[] = [
  'birthDate', 'idCardValidFrom', 'idCardValidTo',
  'licenseValidFrom', 'licenseExpireDate', 'qualificationValidTo'
]

export type DriverOcrDocument = Record<DriverOcrField, string | string[] | null>

export interface DriverOcrResponse {
  rawText: string
  summary: string
  confidence: number
  fieldConfidence: Partial<Record<DriverOcrField, number>>
  missingFields: string[]
  warnings: string[]
  document: DriverOcrDocument
}

export function validateDriverOcrPayload(payload: unknown) {
  const errors: string[] = []
  if (!isOcrRecord(payload)) return { valid: false, errors: ['payload must be an object'] }
  if (!isOcrRecord(payload.document)) errors.push('document must be an object')
  else if (!DRIVER_OCR_FIELDS.some((key) => {
    const value = payload.document[key]
    return typeof value === 'string' ? Boolean(value.trim()) : Array.isArray(value) && value.length > 0
  })) errors.push('document_fields_missing')
  if (!normalizeOcrRawText(payload.rawText)) errors.push('image_text_missing')
  if (typeof payload.confidence !== 'number' || payload.confidence < 0 || payload.confidence > 1) {
    errors.push('confidence must be between 0 and 1')
  }
  if (!isOcrRecord(payload.fieldConfidence)) errors.push('fieldConfidence must be an object')
  return { valid: errors.length === 0, errors }
}

export function normalizeDriverOcrResponse(payload: Record<string, unknown>): DriverOcrResponse {
  const source = isOcrRecord(payload.document) ? payload.document : {}
  const document = {} as DriverOcrDocument
  for (const field of DRIVER_OCR_FIELDS) {
    const value = source[field]
    document[field] = field === 'licenseClasses'
      ? normalizeOcrStringArray(value).slice(0, 8)
      : DATE_FIELDS.includes(field)
        ? normalizeOcrDate(value)
        : normalizeOcrTextValue(value, field === 'homeAddressDetail' ? 200 : 100)
  }
  const fieldConfidence: Partial<Record<DriverOcrField, number>> = {}
  if (isOcrRecord(payload.fieldConfidence)) {
    for (const field of DRIVER_OCR_FIELDS) {
      if (payload.fieldConfidence[field] !== undefined) {
        fieldConfidence[field] = normalizeOcrConfidence(payload.fieldConfidence[field])
      }
    }
  }
  return {
    rawText: normalizeOcrRawText(payload.rawText),
    summary: normalizeOcrTextValue(payload.summary, 500) ?? '证件识别完成，请逐项核对。',
    confidence: normalizeOcrConfidence(payload.confidence),
    fieldConfidence,
    missingFields: normalizeOcrStringArray(payload.missingFields),
    warnings: normalizeOcrStringArray(payload.warnings),
    document
  }
}

export function compareDriverOcrPayloads(
  proposed: Record<string, unknown>, finalPayload: Record<string, unknown>
) {
  const acceptedFields: string[] = []
  const correctedFields: string[] = []
  for (const field of DRIVER_OCR_FIELDS) {
    if (proposed[field] == null) continue
    if (JSON.stringify(proposed[field]) === JSON.stringify(finalPayload[field] ?? null)) {
      acceptedFields.push(field)
    } else correctedFields.push(field)
  }
  return { acceptedFields, correctedFields }
}
