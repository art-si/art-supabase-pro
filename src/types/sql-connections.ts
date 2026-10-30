import type { SqlMetadataRef } from '@/utils/sql-workbench'

export type SqlDialect = 'postgres' | 'mysql' | 'dm'
export interface SqlConnection {
  id: string
  name: string
  dialect: SqlDialect
  host: string
  port: number
  database: string
  username: string
  tls: boolean
  enabled: boolean
  tenantId: string
  allowedUserIds: string[]
  updatedAt: string
}
export interface SqlConnectionInput extends Omit<SqlConnection, 'id' | 'updatedAt'> {
  id?: string
  password?: string
}
export interface SqlGatewayUser {
  id: string
  name: string
  tenantId: string
}
export interface SqlGatewaySnapshot {
  connections: SqlConnection[]
  users: SqlGatewayUser[]
  canManage: boolean
}
export interface SqlGatewayQuery {
  query: string
  schema?: string
  maxRows: number
  timeoutMs: number
  action: 'execute' | 'explain'
}
export interface SqlGatewayResult {
  status: 'ok'
  rows: Record<string, unknown>[]
  columns: { name: string }[]
  commandTag: string
  rowCount: number
  truncated: boolean
  durationMs: number
  maxRows: number
  timeoutMs: number
}
export type SqlConnectionMetadata = SqlMetadataRef & {
  foreignKeys: NonNullable<SqlMetadataRef['foreignKeys']>
}
