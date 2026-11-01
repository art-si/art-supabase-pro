export type SqlQueryApiParameterType = 'string' | 'number' | 'boolean' | 'date' | 'uuid'

/** Decimal values stay text; an absent key means the parameter is not provided. */
export type SqlQueryApiParameterValue = string | boolean | null
export type SqlQueryApiParameters = Record<string, SqlQueryApiParameterValue>
export type SqlQueryApiParameterDraft =
  { kind: 'omit' } | { kind: 'null' } | { kind: 'value'; value: string | boolean }

export interface SqlQueryApiParameter {
  name: string
  type: SqlQueryApiParameterType
  required: boolean
}

export interface SqlQueryApiDefinition {
  id: string
  slug: string
  name: string
  description: string
  sql: string
  tenantId: string
  allowedUserIds: string[]
  parameters: SqlQueryApiParameter[]
  maxRows: number
  timeoutMs: number
  enabled: boolean
  updatedAt: string
}

export type SqlQueryApiInput = Omit<SqlQueryApiDefinition, 'id' | 'updatedAt'> & {
  id?: string
  updatedAt?: string
}

export interface SqlQueryApiSnapshot {
  definitions: SqlQueryApiDefinition[]
  canManage: boolean
  users: { id: string; name: string; tenantId: string }[]
}

export interface SqlQueryApiResult {
  status: 'ok'
  rows: Record<string, unknown>[]
  columns: { name: string }[]
  rowCount: number
  truncated: boolean
  durationMs: number
  maxRows: number
  timeoutMs: number
}

/** Only the original invocation response confirms the database has stopped. */
export interface SqlQueryApiCancelled {
  status: 'cancelled'
  message: string
  durationMs: number
}

export interface SqlQueryApiCancelState {
  state: 'cancel_requested' | 'not_running' | 'finished'
}
