import type {
  SqlConnection,
  SqlConnectionInput,
  SqlDialect,
  SqlConnectionMetadata,
  SqlGatewayResult
} from '@/types/sql-connections'

import { toObjectRecord as object } from './record'
export const SQL_DIALECT_LABELS: Record<SqlDialect, string> = {
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  dm: '达梦 DM8'
}
export const SQL_DIALECT_PORTS: Record<SqlDialect, number> = {
  postgres: 5432,
  mysql: 3306,
  dm: 5236
}
export function getSqlDatabaseLabel(
  connection: Pick<SqlConnection, 'database' | 'dialect'>
): string {
  return connection.database || (connection.dialect === 'dm' ? '默认 schema' : '未指定数据库')
}
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')
const optionalText = (value: unknown) =>
  value === undefined || value === null || typeof value === 'string'
const optionalBoolean = (value: unknown) => value === undefined || typeof value === 'boolean'

/** Normalize the visual plan while preserving each engine's original JSON for inspection/copy. */
export function normalizeExternalPlan(
  result: SqlGatewayResult,
  dialect: SqlDialect
): Api.DataCenter.SqlConsole.SqlExplainResponse {
  if (dialect === 'dm') {
    throw new Error('达梦执行计划暂不可用，请使用数据库管理工具查看')
  }
  let raw: unknown = result.rows[0]?.[dialect === 'postgres' ? 'QUERY PLAN' : 'EXPLAIN']
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      throw new Error('执行计划格式无效，请重试')
    }
  }
  if (dialect === 'postgres') {
    if (
      !Array.isArray(raw) ||
      !raw.every((value) => value && typeof value === 'object' && !Array.isArray(value))
    )
      throw new Error('执行计划格式无效')
    return { status: 'ok', plan: raw, rawPlan: raw, durationMs: result.durationMs }
  }
  const read = (value: unknown, label: string): Record<string, unknown> => {
    const row = object(value)
    const table = object(row.table)
    const cost = object(row.cost_info)
    const children: Record<string, unknown>[] = []
    for (const [key, child] of Object.entries(row)) {
      if (key === 'cost_info' || key === 'table') continue
      if (Array.isArray(child))
        child.forEach((value) => {
          if (value && typeof value === 'object') children.push(read(value, key))
        })
      else if (child && typeof child === 'object') children.push(read(child, key))
    }
    return {
      'Node Type':
        typeof table.access_type === 'string'
          ? `MySQL ${table.access_type}`
          : label.replaceAll('_', ' '),
      'Relation Name': table.table_name,
      'Index Name': table.key,
      Filter: table.attached_condition,
      'Plan Rows':
        typeof table.rows_produced_per_join === 'number'
          ? table.rows_produced_per_join
          : table.rows_examined_per_scan,
      'Total Cost': Number.isFinite(Number(cost.query_cost)) ? Number(cost.query_cost) : undefined,
      Plans: children
    }
  }
  if (!raw || typeof raw !== 'object' || !('query_block' in raw))
    throw new Error('执行计划格式无效，请检查 MySQL 版本')
  return {
    status: 'ok',
    plan: [{ Plan: read(raw.query_block, 'MySQL query') }],
    rawPlan: raw,
    durationMs: result.durationMs
  }
}
export function isSqlConnectionMetadata(value: unknown): value is SqlConnectionMetadata {
  const row = object(value)
  return (
    strings(row.schemas) &&
    Array.isArray(row.tables) &&
    row.tables.every((raw) => {
      const table = object(raw)
      return (
        typeof table.tableSchema === 'string' &&
        typeof table.tableName === 'string' &&
        optionalText(table.description) &&
        (table.kind === undefined ||
          ['table', 'view', 'materialized_view'].includes(String(table.kind))) &&
        Array.isArray(table.columns) &&
        table.columns.every((rawColumn) => {
          const column = object(rawColumn)
          return (
            typeof column.name === 'string' &&
            typeof column.dataType === 'string' &&
            typeof column.isNullable === 'boolean' &&
            optionalText(column.description) &&
            optionalText(column.defaultValue) &&
            optionalBoolean(column.isPrimaryKey)
          )
        }) &&
        (table.indexes === undefined ||
          (Array.isArray(table.indexes) &&
            table.indexes.every((rawIndex) => {
              const index = object(rawIndex)
              return (
                typeof index.name === 'string' &&
                strings(index.columns) &&
                typeof index.isUnique === 'boolean' &&
                typeof index.isPrimary === 'boolean' &&
                optionalText(index.definition)
              )
            })))
      )
    }) &&
    Array.isArray(row.columns) &&
    row.columns.every((raw) => {
      const column = object(raw)
      return (
        ['tableSchema', 'tableName', 'columnName', 'dataType', 'isNullable'].every(
          (key) => typeof column[key] === 'string'
        ) &&
        typeof column.ordinalPosition === 'number' &&
        optionalText(column.description) &&
        optionalText(column.defaultValue) &&
        optionalBoolean(column.isPrimaryKey)
      )
    }) &&
    Array.isArray(row.functions) &&
    row.functions.every((raw) => {
      const fn = object(raw)
      return ['routineSchema', 'routineName', 'returnType'].every(
        (key) => typeof fn[key] === 'string'
      )
    }) &&
    Array.isArray(row.foreignKeys) &&
    row.foreignKeys.every((raw) => {
      const key = object(raw)
      return [
        'sourceSchema',
        'sourceTable',
        'sourceColumn',
        'targetSchema',
        'targetTable',
        'targetColumn',
        'constraintName'
      ].every((field) => typeof key[field] === 'string')
    })
  )
}

export function isSqlGatewayResult(value: unknown): value is SqlGatewayResult {
  const row = object(value)
  return (
    row.status === 'ok' &&
    Array.isArray(row.rows) &&
    row.rows.every(
      (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
    ) &&
    Array.isArray(row.columns) &&
    row.columns.every((column) => typeof object(column).name === 'string') &&
    typeof row.commandTag === 'string' &&
    typeof row.truncated === 'boolean' &&
    ['rowCount', 'durationMs', 'maxRows', 'timeoutMs'].every(
      (key) => typeof row[key] === 'number' && Number.isFinite(row[key])
    )
  )
}

export function isSqlConnection(value: unknown): value is SqlConnection {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    ['id', 'name', 'host', 'database', 'username', 'tenantId', 'updatedAt'].every(
      (key) => typeof row[key] === 'string'
    ) &&
    (row.dialect === 'postgres' || row.dialect === 'mysql' || row.dialect === 'dm') &&
    typeof row.port === 'number' &&
    Number.isInteger(row.port) &&
    row.port > 0 &&
    row.port <= 65535 &&
    typeof row.tls === 'boolean' &&
    typeof row.enabled === 'boolean' &&
    Array.isArray(row.allowedUserIds) &&
    row.allowedUserIds.every((id) => typeof id === 'string')
  )
}

export function validateSqlConnection(input: unknown): SqlConnectionInput {
  if (!input || typeof input !== 'object') throw new Error('请填写数据库连接信息')
  const row = input as Record<string, unknown>
  const text = (key: string, max = 200) => {
    const value = row[key]
    if (typeof value !== 'string' || !value.trim() || value.length > max || /\p{Cc}/u.test(value))
      throw new Error('连接信息不完整或包含无效字符，请检查后重试')
    return value.trim()
  }
  const dialect = row.dialect
  if (dialect !== 'postgres' && dialect !== 'mysql' && dialect !== 'dm')
    throw new Error('请选择 PostgreSQL、MySQL 或达梦 DM8')
  const port = row.port
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('请输入有效的数据库端口')
  const host = text('host', 253)
  if (!/^[a-z\d.:_-]+$/i.test(host) || host.includes('://'))
    throw new Error('主机只填写域名或 IP 地址')
  if (
    !Array.isArray(row.allowedUserIds) ||
    row.allowedUserIds.length > 100 ||
    !row.allowedUserIds.every((id) => typeof id === 'string' && /^[a-f\d-]{36}$/i.test(id))
  )
    throw new Error('请选择有效的授权账号')
  if (typeof row.tls !== 'boolean' || typeof row.enabled !== 'boolean')
    throw new Error('连接设置无效')
  if (
    row.password !== undefined &&
    (typeof row.password !== 'string' || row.password.length > 4096)
  )
    throw new Error('数据库密码无效')
  if (row.id !== undefined && (typeof row.id !== 'string' || !/^[a-f\d-]{36}$/i.test(row.id)))
    throw new Error('连接标识无效')
  return {
    id: row.id,
    name: text('name', 80),
    dialect,
    host,
    port,
    database:
      dialect === 'dm' && (row.database === '' || row.database === undefined)
        ? ''
        : text('database'),
    username: text('username'),
    password: row.password,
    tls: row.tls,
    enabled: row.enabled,
    tenantId: text('tenantId'),
    allowedUserIds: row.allowedUserIds
  }
}

export function isHiddenSqlSchema(schema: string): boolean {
  return (
    /^(?:pg_|information_schema$|mysql$|performance_schema$|sys$|SYSDBA$|SYSAUDITOR$|SYSSSO$|CTISYS$|SYSGEO$)/i.test(
      schema
    ) ||
    [
      'auth',
      'storage',
      'realtime',
      'extensions',
      'supabase_migrations',
      'vault',
      'graphql',
      'graphql_public',
      'net',
      'cron',
      'pgbouncer'
    ].includes(schema)
  )
}
