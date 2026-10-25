import { normalizeOcrRawText } from './ai-ocr-text.ts'
import {
  isOcrRecord as isRecord,
  normalizeOcrConfidence as confidenceValue,
  normalizeOcrStringArray as stringArray,
  normalizeOcrTextValue as textValue
} from './ai-ocr-values.ts'

export const SMIS_HAZARD_LEVELS = [
  'major',
  'general_a',
  'general_b',
  'general_c',
  'general_d'
] as const

export type SmisHazardLevel = (typeof SMIS_HAZARD_LEVELS)[number]

export const AI_SMIS_HAZARD_FIELDS = [
  'description',
  'hazardLevel',
  'rectificationSuggestion'
] as const

export type AiSmisHazardField = (typeof AI_SMIS_HAZARD_FIELDS)[number]

export interface AiSmisHazardDraft {
  description: string | null
  hazardLevel: SmisHazardLevel | null
  rectificationSuggestion: string | null
}

export interface AiSmisHazardNormalizedResponse {
  rawText: string
  summary: string
  confidence: number
  fieldConfidence: Partial<Record<AiSmisHazardField, number>>
  missingFields: string[]
  warnings: string[]
  observedHazards: string[]
  evidence: string[]
  hazard: AiSmisHazardDraft
}

interface ContractValidationResult {
  valid: boolean
  errors: string[]
}

function hazardLevelValue(value: unknown): SmisHazardLevel | null {
  return typeof value === 'string' && SMIS_HAZARD_LEVELS.includes(value as SmisHazardLevel)
    ? (value as SmisHazardLevel)
    : null
}

export function validateAiSmisHazardPayload(payload: unknown): ContractValidationResult {
  const errors: string[] = []
  if (!isRecord(payload)) return { valid: false, errors: ['payload must be an object'] }
  if (!isRecord(payload.hazard)) errors.push('hazard must be an object')
  if (typeof payload.confidence !== 'number' || payload.confidence < 0 || payload.confidence > 1) {
    errors.push('confidence must be between 0 and 1')
  }
  if (!isRecord(payload.fieldConfidence)) errors.push('fieldConfidence must be an object')
  if (isRecord(payload.hazard)) {
    const level = payload.hazard.hazardLevel
    if (level !== null && level !== undefined && !hazardLevelValue(level)) {
      errors.push('hazard.hazardLevel must be a supported value or null')
    }
  }
  return { valid: errors.length === 0, errors }
}

export function normalizeAiSmisHazardResponse(
  payload: Record<string, unknown>
): AiSmisHazardNormalizedResponse {
  const source = isRecord(payload.hazard) ? payload.hazard : {}
  const hazard: AiSmisHazardDraft = {
    description: textValue(source.description, 1000),
    hazardLevel: hazardLevelValue(source.hazardLevel),
    rectificationSuggestion: textValue(source.rectificationSuggestion, 1000)
  }
  const fieldConfidence: Partial<Record<AiSmisHazardField, number>> = {}
  if (isRecord(payload.fieldConfidence)) {
    for (const field of AI_SMIS_HAZARD_FIELDS) {
      if (payload.fieldConfidence[field] !== undefined) {
        fieldConfidence[field] = confidenceValue(payload.fieldConfidence[field])
      }
    }
  }
  const missingFields: string[] = []
  if (!hazard.description) missingFields.push('隐患描述')
  if (!hazard.hazardLevel) missingFields.push('隐患级别')
  if (!hazard.rectificationSuggestion) missingFields.push('整改建议')
  const warnings = [...new Set(stringArray(payload.warnings))]
  if (hazard.hazardLevel === 'major') {
    warnings.unshift('AI 疑似识别为重大隐患，必须由安全管理人员立即复核并按制度处置。')
  }
  return {
    rawText: normalizeOcrRawText(payload.rawText),
    summary: textValue(payload.summary, 500) ?? '现场照片分析完成，请人工核对后应用。',
    confidence: confidenceValue(payload.confidence),
    fieldConfidence,
    missingFields,
    warnings: [...new Set(warnings)],
    observedHazards: [...new Set(stringArray(payload.observedHazards))].slice(0, 8),
    evidence: [...new Set(stringArray(payload.evidence))].slice(0, 8),
    hazard
  }
}

function comparable(value: unknown): string {
  return String(value ?? '').trim()
}

export function compareAiSmisHazardPayloads(
  proposed: Record<string, unknown>,
  finalPayload: Record<string, unknown>
): { acceptedFields: string[]; correctedFields: string[] } {
  const acceptedFields: string[] = []
  const correctedFields: string[] = []
  for (const field of AI_SMIS_HAZARD_FIELDS) {
    const value = proposed[field]
    if (value === null || value === undefined || value === '') continue
    if (comparable(value) === comparable(finalPayload[field])) acceptedFields.push(field)
    else correctedFields.push(field)
  }
  return { acceptedFields, correctedFields }
}
