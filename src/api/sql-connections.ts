import { requestLocalExecutor } from './local-executor'
import {
  isSqlConnection,
  isSqlConnectionMetadata,
  isSqlGatewayResult
} from '@/utils/sql-connections'
import type {
  SqlConnection,
  SqlConnectionInput,
  SqlConnectionMetadata,
  SqlGatewaySnapshot,
  SqlGatewayQuery,
  SqlGatewayResult
} from '@/types/sql-connections'

import { toObjectRecord as object } from '@/utils/record'

export async function fetchSqlConnections(
  base: string,
  tenantScope: string
): Promise<SqlGatewaySnapshot> {
  const value = object(await requestLocalExecutor(base, '/snapshot', undefined, tenantScope))
  if (
    !Array.isArray(value.connections) ||
    !value.connections.every(isSqlConnection) ||
    !Array.isArray(value.users) ||
    typeof value.canManage !== 'boolean'
  )
    throw new Error('连接列表格式无效，请更新执行端后重试')
  const users = value.users.map((raw) => {
    const row = object(raw)
    if (
      typeof row.id !== 'string' ||
      typeof row.name !== 'string' ||
      typeof row.tenantId !== 'string'
    )
      throw new Error('授权账号格式无效，请重试')
    return { id: row.id, name: row.name, tenantId: row.tenantId }
  })
  return { connections: value.connections, users, canManage: value.canManage }
}

export async function saveSqlConnection(
  base: string,
  scope: string,
  input: SqlConnectionInput
): Promise<SqlConnection> {
  const value = await requestLocalExecutor(base, '/connections/save', input, scope)
  if (!isSqlConnection(value)) throw new Error('连接保存结果无效，请刷新后重试')
  return value
}
export async function testSqlConnection(
  base: string,
  scope: string,
  input: SqlConnectionInput
): Promise<void> {
  const value = object(await requestLocalExecutor(base, '/connections/test', input, scope))
  if (value.ok !== true) throw new Error('连接测试失败，请检查设置后重试')
}

export async function fetchSqlConnectionMetadata(
  base: string,
  scope: string,
  id: string,
  schema?: string
): Promise<SqlConnectionMetadata> {
  const value = await requestLocalExecutor(
    base,
    `/connections/${encodeURIComponent(id)}/metadata`,
    { schema },
    scope
  )
  if (!isSqlConnectionMetadata(value)) throw new Error('数据库结构格式无效，请刷新后重试')
  return value
}

export async function executeSqlConnection(
  base: string,
  scope: string,
  id: string,
  request: SqlGatewayQuery
): Promise<SqlGatewayResult> {
  const value = await requestLocalExecutor(
    base,
    `/connections/${encodeURIComponent(id)}/query`,
    request,
    scope
  )
  if (!isSqlGatewayResult(value)) throw new Error('查询结果格式无效，请更新执行端后重试')
  return value
}
