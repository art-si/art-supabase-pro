import { normalizeOcrRawText } from './ai-ocr-text.ts'
import {
  isOcrRecord as isRecord,
  normalizeOcrConfidence as confidenceValue,
  normalizeOcrDate as dateValue,
  normalizeOcrTextValue as textValue,
  normalizeOcrStringArray as stringArray
} from './ai-ocr-values.ts'

export const SMIS_INSPECTION_CONCLUSIONS = [
  'operable',
  'operable_after_rectification',
  'inoperable'
] as const
export type SmisInspectionConclusion = (typeof SMIS_INSPECTION_CONCLUSIONS)[number]

export const AI_SMIS_INSPECTION_FIELDS = [
  'inspectionDate',
  'conclusion',
  'nextDueDate',
  'remark'
] as const
export type AiSmisInspectionField = (typeof AI_SMIS_INSPECTION_FIELDS)[number]

export interface AiSmisInspectionReportDraft {
  reportNumber: string | null
  equipmentCode: string | null
  equipmentName: string | null
  institutionName: string | null
  inspectionDate: string | null
  conclusion: SmisInspectionConclusion | null
  nextDueDate: string | null
  remark: string | null
}

export interface AiSmisInspectionReportNormalizedResponse {
  rawText: string
  summary: string
  confidence: number
  fieldConfidence: Partial<Record<AiSmisInspectionField, number>>
  missingFields: string[]
  warnings: string[]
  report: AiSmisInspectionReportDraft
}

function conclusionValue(value: unknown): SmisInspectionConclusion | null {
  return typeof value === 'string' &&
    SMIS_INSPECTION_CONCLUSIONS.includes(value as SmisInspectionConclusion)
    ? (value as SmisInspectionConclusion)
    : null
}

export function validateAiSmisInspectionReportPayload(payload: unknown) {
  const errors: string[] = []
  if (!isRecord(payload)) return { valid: false, errors: ['payload must be an object'] }
  if (!isRecord(payload.report)) errors.push('report must be an object')
  if (typeof payload.confidence !== 'number' || payload.confidence < 0 || payload.confidence > 1) {
    errors.push('confidence must be between 0 and 1')
  }
  if (!isRecord(payload.fieldConfidence)) errors.push('fieldConfidence must be an object')
  if (isRecord(payload.report)) {
    const conclusion = payload.report.conclusion
    if (conclusion !== null && conclusion !== undefined && !conclusionValue(conclusion)) {
      errors.push('report.conclusion must be a supported value or null')
    }
  }
  return { valid: errors.length === 0, errors }
}

export function normalizeAiSmisInspectionReportResponse(
  payload: Record<string, unknown>
): AiSmisInspectionReportNormalizedResponse {
  const source = isRecord(payload.report) ? payload.report : {}
  const report: AiSmisInspectionReportDraft = {
    reportNumber: textValue(source.reportNumber, 160),
    equipmentCode: textValue(source.equipmentCode, 160),
    equipmentName: textValue(source.equipmentName, 200),
    institutionName: textValue(source.institutionName, 200),
    inspectionDate: dateValue(source.inspectionDate),
    conclusion: conclusionValue(source.conclusion),
    nextDueDate: dateValue(source.nextDueDate),
    remark: textValue(source.remark, 1000)
  }
  const fieldConfidence: Partial<Record<AiSmisInspectionField, number>> = {}
  if (isRecord(payload.fieldConfidence)) {
    for (const field of AI_SMIS_INSPECTION_FIELDS) {
      if (payload.fieldConfidence[field] !== undefined) {
        fieldConfidence[field] = confidenceValue(payload.fieldConfidence[field])
      }
    }
  }
  const missingFields: string[] = []
  if (!report.inspectionDate) missingFields.push('检验日期')
  if (!report.conclusion) missingFields.push('检验结论')
  return {
    rawText: normalizeOcrRawText(payload.rawText),
    summary: textValue(payload.summary, 500) ?? '检验报告识别完成，请人工核对后应用。',
    confidence: confidenceValue(payload.confidence),
    fieldConfidence,
    missingFields,
    warnings: [...new Set(stringArray(payload.warnings))],
    report
  }
}

export function compareAiSmisInspectionReportPayloads(
  proposed: Record<string, unknown>,
  finalPayload: Record<string, unknown>
): { acceptedFields: string[]; correctedFields: string[] } {
  const acceptedFields: string[] = []
  const correctedFields: string[] = []
  for (const field of AI_SMIS_INSPECTION_FIELDS) {
    const value = proposed[field]
    if (value === null || value === undefined || value === '') continue
    if (String(value).trim() === String(finalPayload[field] ?? '').trim()) acceptedFields.push(field)
    else correctedFields.push(field)
  }
  return { acceptedFields, correctedFields }
}
