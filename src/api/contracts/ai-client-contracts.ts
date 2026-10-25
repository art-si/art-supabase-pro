import type {
  AiPlannerCapabilities,
  AiPlannerState,
  RecordAiSuggestionEventResponse
} from '@/types/ai-project-planner'
import type {
  ProjectCapabilitySnapshot,
  ProjectCatalogRequest,
  ProjectDatabaseObject,
  ProjectEdgeFunctionResult,
  ProjectObjectDetail,
  ProjectOverview,
  ProjectRelationship
} from '@/types/supabase-ai-assistant'

export interface ProjectCatalogResultMap {
  overview: ProjectOverview
  schemas: string[]
  list_objects: ProjectDatabaseObject[]
  object_detail: ProjectObjectDetail
  relationships: ProjectRelationship[]
  capability_snapshot: ProjectCapabilitySnapshot
  edge_functions: ProjectEdgeFunctionResult
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const hasStrings = (record: Record<string, unknown>, keys: readonly string[]): boolean =>
  keys.every((key) => typeof record[key] === 'string' && record[key].trim() !== '')

const isDatabaseObject = (value: unknown): boolean =>
  isRecord(value) && hasStrings(value, ['schemaName', 'objectName', 'objectType'])

const isRelationship = (value: unknown): boolean =>
  isRecord(value) &&
  hasStrings(value, [
    'constraintName',
    'sourceSchema',
    'sourceTable',
    'targetSchema',
    'targetTable'
  ]) &&
  Array.isArray(value.sourceColumns) &&
  value.sourceColumns.every((item) => typeof item === 'string') &&
  Array.isArray(value.targetColumns) &&
  value.targetColumns.every((item) => typeof item === 'string')

export function isProjectCatalogResult(
  action: ProjectCatalogRequest['catalogAction'],
  value: unknown
): boolean {
  if (action === 'schemas')
    return Array.isArray(value) && value.every((item) => typeof item === 'string')
  if (action === 'list_objects') return Array.isArray(value) && value.every(isDatabaseObject)
  if (action === 'relationships') return Array.isArray(value) && value.every(isRelationship)
  if (!isRecord(value)) return false
  if (action === 'overview') return hasStrings(value, ['projectRef', 'databaseVersion'])
  if (action === 'object_detail') return value.notFound === true || isDatabaseObject(value)
  if (action === 'edge_functions') {
    return (
      typeof value.projectRef === 'string' &&
      Array.isArray(value.functions) &&
      ['management_api', 'bundled_manifest'].includes(String(value.source))
    )
  }
  return (
    action === 'capability_snapshot' &&
    hasStrings(value, ['projectRef', 'capturedAt']) &&
    isRecord(value.database) &&
    isRecord(value.security) &&
    isRecord(value.performance)
  )
}

export const isPlannerCapabilities = (value: unknown): value is AiPlannerCapabilities =>
  isRecord(value) &&
  typeof value.version === 'string' &&
  Array.isArray(value.categories) &&
  Array.isArray(value.efforts) &&
  Array.isArray(value.events) &&
  isRecord(value.access) &&
  isRecord(value.repositorySnapshot)

export const isPlannerState = (value: unknown): value is AiPlannerState =>
  isRecord(value) &&
  Array.isArray(value.suggestions) &&
  isRecord(value.preferenceSummary) &&
  isRecord(value.statusCounts) &&
  isRecord(value.snapshot)

export const isSuggestionEventResponse = (
  value: unknown
): value is RecordAiSuggestionEventResponse =>
  isRecord(value) &&
  value.ok === true &&
  typeof value.suggestionId === 'string' &&
  typeof value.eventType === 'string'
