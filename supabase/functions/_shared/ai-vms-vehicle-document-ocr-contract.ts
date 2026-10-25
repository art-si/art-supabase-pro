import { normalizeOcrRawText } from './ai-ocr-text.ts'
import {
  isOcrRecord,
  normalizeOcrConfidence,
  normalizeOcrDate,
  normalizeOcrStringArray,
  normalizeOcrTextValue
} from './ai-ocr-values.ts'

export const VMS_VEHICLE_DOCUMENT_FIELDS = [
  'plateNo',
  'vin',
  'engineNo',
  'vehicleType',
  'brandModel',
  'ownerName',
  'registerDate',
  'issueDate',
  'operationCertNo',
  'operationType'
] as const

export type VmsVehicleDocumentField = (typeof VMS_VEHICLE_DOCUMENT_FIELDS)[number]

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PUBLIC_ATTACHMENT_PREFIX = '/storage/v1/object/public/attachments/'

export function isValidVmsVehicleDocumentTenantScope(tenantId: string | null): boolean {
  return tenantId === null || UUID_PATTERN.test(tenantId)
}

export function areVmsVehicleDocumentImageUrlsInScope(
  imageUrls: string[],
  supabaseUrl: string,
  tenantId: string | null
): boolean {
  if (!imageUrls.length || !isValidVmsVehicleDocumentTenantScope(tenantId)) return false
  let expectedOrigin: string
  try {
    expectedOrigin = new URL(supabaseUrl).origin
  } catch {
    return false
  }
  return imageUrls.every((value) => {
    try {
      const url = new URL(value)
      if (
        url.origin !== expectedOrigin ||
        url.username ||
        url.password ||
        url.hash ||
        !url.pathname.startsWith(PUBLIC_ATTACHMENT_PREFIX)
      ) {
        return false
      }
      const objectPath = url.pathname.slice(PUBLIC_ATTACHMENT_PREFIX.length)
      const separator = objectPath.indexOf('/')
      if (separator < 1 || separator === objectPath.length - 1) return false
      const imageTenantId = objectPath.slice(0, separator)
      return UUID_PATTERN.test(imageTenantId) && (tenantId === null || imageTenantId === tenantId)
    } catch {
      return false
    }
  })
}

export interface VmsVehicleDocumentDraft {
  plateNo: string | null
  vin: string | null
  engineNo: string | null
  vehicleType: string | null
  brandModel: string | null
  ownerName: string | null
  registerDate: string | null
  issueDate: string | null
  operationCertNo: string | null
  operationType: string | null
}

export interface VmsVehicleDocumentOcrResponse {
  rawText: string
  summary: string
  confidence: number
  fieldConfidence: Partial<Record<VmsVehicleDocumentField, number>>
  missingFields: string[]
  warnings: string[]
  document: VmsVehicleDocumentDraft
}

export function validateVmsVehicleDocumentOcrPayload(payload: unknown) {
  const errors: string[] = []
  if (!isOcrRecord(payload)) return { valid: false, errors: ['payload must be an object'] }
  if (!isOcrRecord(payload.document)) {
    errors.push('document must be an object')
  } else if (
    !VMS_VEHICLE_DOCUMENT_FIELDS.some(
      (field) => typeof payload.document[field] === 'string' && payload.document[field].trim()
    )
  ) {
    errors.push('document_fields_missing')
  }
  if (!normalizeOcrRawText(payload.rawText)) errors.push('image_text_missing')
  if (typeof payload.confidence !== 'number' || payload.confidence < 0 || payload.confidence > 1) {
    errors.push('confidence must be between 0 and 1')
  }
  if (!isOcrRecord(payload.fieldConfidence)) errors.push('fieldConfidence must be an object')
  return { valid: errors.length === 0, errors }
}

export function normalizeVmsVehicleDocumentOcrResponse(
  payload: Record<string, unknown>
): VmsVehicleDocumentOcrResponse {
  const source = isOcrRecord(payload.document) ? payload.document : {}
  const document = {} as VmsVehicleDocumentDraft
  for (const field of VMS_VEHICLE_DOCUMENT_FIELDS) {
    document[field] =
      field === 'registerDate' || field === 'issueDate'
        ? normalizeOcrDate(source[field])
        : normalizeOcrTextValue(source[field], 160)
  }
  const fieldConfidence: Partial<Record<VmsVehicleDocumentField, number>> = {}
  if (isOcrRecord(payload.fieldConfidence)) {
    for (const field of VMS_VEHICLE_DOCUMENT_FIELDS) {
      if (payload.fieldConfidence[field] !== undefined) {
        fieldConfidence[field] = normalizeOcrConfidence(payload.fieldConfidence[field])
      }
    }
  }
  return {
    rawText: normalizeOcrRawText(payload.rawText),
    summary:
      normalizeOcrTextValue(payload.summary, 500) ?? '证照识别完成，请核对后应用。',
    confidence: normalizeOcrConfidence(payload.confidence),
    fieldConfidence,
    missingFields: normalizeOcrStringArray(payload.missingFields),
    warnings: normalizeOcrStringArray(payload.warnings),
    document
  }
}

export function compareVmsVehicleDocumentOcrPayloads(
  proposed: Record<string, unknown>,
  finalPayload: Record<string, unknown>
) {
  const acceptedFields: string[] = []
  const correctedFields: string[] = []
  for (const field of VMS_VEHICLE_DOCUMENT_FIELDS) {
    if (proposed[field] === null || proposed[field] === undefined) continue
    if (String(proposed[field]).trim() === String(finalPayload[field] ?? '').trim()) {
      acceptedFields.push(field)
    } else correctedFields.push(field)
  }
  return { acceptedFields, correctedFields }
}
