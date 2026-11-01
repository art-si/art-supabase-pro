import { invokeSupabaseFunctionWithSessionRecovery } from '@/utils/supabase/functions'
import { createFriendlySupabaseFunctionError } from '@/utils/supabase'
import { toObjectRecord } from '@/utils/record'
import type {
  SqlQueryApiDefinition,
  SqlQueryApiInput,
  SqlQueryApiParameter,
  SqlQueryApiCancelled,
  SqlQueryApiCancelState,
  SqlQueryApiResult,
  SqlQueryApiSnapshot
} from '@/types/sql-query-api'

const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')
const isParameter = (value: unknown): value is SqlQueryApiParameter => {
  const row = toObjectRecord(value)
  return (
    typeof row.name === 'string' &&
    typeof row.required === 'boolean' &&
    ['string', 'number', 'boolean', 'date', 'uuid'].includes(String(row.type))
  )
}
const isDefinition = (value: unknown): value is SqlQueryApiDefinition => {
  const row = toObjectRecord(value)
  return (
    typeof row.slug === 'string' &&
    /^[a-z][a-z0-9-]{2,63}$/.test(row.slug) &&
    ['id', 'slug', 'name', 'description', 'sql', 'tenantId', 'updatedAt'].every(
      (key) => typeof row[key] === 'string'
    ) &&
    strings(row.allowedUserIds) &&
    typeof row.enabled === 'boolean' &&
    Array.isArray(row.parameters) &&
    row.parameters.every(isParameter) &&
    typeof row.maxRows === 'number' &&
    typeof row.timeoutMs === 'number'
  )
}

async function invoke(route: string, body: object): Promise<unknown> {
  const { data, error } = await invokeSupabaseFunctionWithSessionRecovery<unknown>(route, { body })
  if (error) throw await createFriendlySupabaseFunctionError(error, '查询 API 操作失败，请稍后重试')
  return data
}

export async function fetchSqlQueryApis(): Promise<SqlQueryApiSnapshot> {
  const row = toObjectRecord(await invoke('sql-query-api', { action: 'list' }))
  if (
    !Array.isArray(row.definitions) ||
    !row.definitions.every(isDefinition) ||
    typeof row.canManage !== 'boolean' ||
    !Array.isArray(row.users)
  )
    throw new Error('查询 API 列表格式无效，请刷新后重试')
  const users = row.users.map((value) => {
    const user = toObjectRecord(value)
    if (
      typeof user.id !== 'string' ||
      typeof user.name !== 'string' ||
      typeof user.tenantId !== 'string'
    )
      throw new Error('授权账号列表格式无效，请刷新后重试')
    return { id: user.id, name: user.name, tenantId: user.tenantId }
  })
  return { definitions: row.definitions, canManage: row.canManage, users }
}

export async function saveSqlQueryApi(input: SqlQueryApiInput): Promise<SqlQueryApiDefinition> {
  const data = await invoke('sql-query-api', { action: 'save', input })
  if (!isDefinition(data)) throw new Error('查询 API 保存结果无效，请刷新列表核对')
  return data
}

export function getSqlQueryApiUrl(slug: string): string {
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(slug)) throw new Error('查询 API 地址标识无效，请重新选择')
  return `${String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, '')}/functions/v1/sql-query-api/${slug}`
}

export async function invokeSqlQueryApi(
  slug: string,
  params: Record<string, unknown>,
  requestId?: string
): Promise<SqlQueryApiResult | SqlQueryApiCancelled> {
  getSqlQueryApiUrl(slug)
  const data = toObjectRecord(
    await invoke(`sql-query-api/${encodeURIComponent(slug)}`, {
      params,
      ...(requestId ? { requestId } : {})
    })
  )
  if (
    data.status === 'cancelled' &&
    typeof data.durationMs === 'number' &&
    Number.isFinite(data.durationMs) &&
    data.durationMs >= 0
  )
    return { status: 'cancelled', message: '查询已取消', durationMs: data.durationMs }
  if (
    data.status !== 'ok' ||
    !Array.isArray(data.rows) ||
    !data.rows.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row)) ||
    !Array.isArray(data.columns) ||
    !data.columns.every((column) => typeof toObjectRecord(column).name === 'string') ||
    typeof data.truncated !== 'boolean' ||
    !['rowCount', 'durationMs', 'maxRows', 'timeoutMs'].every(
      (key) => typeof data[key] === 'number' && Number.isFinite(data[key])
    )
  )
    throw new Error('查询 API 返回格式无效，请联系发布者检查')
  return {
    status: 'ok',
    rows: data.rows,
    columns: data.columns,
    rowCount: data.rowCount as number,
    durationMs: data.durationMs as number,
    truncated: data.truncated,
    maxRows: data.maxRows as number,
    timeoutMs: data.timeoutMs as number
  }
}

/** An acknowledgement is not a terminal result; wait for the original invocation. */
export async function cancelSqlQueryApi(
  requestId: string,
  definitionId: string
): Promise<SqlQueryApiCancelState> {
  const data = toObjectRecord(
    await invoke('sql-query-api', { action: 'cancel', requestId, definitionId })
  )
  if (
    data.status !== 'ok' ||
    (data.state !== 'cancel_requested' && data.state !== 'not_running' && data.state !== 'finished')
  )
    throw new Error('取消请求未被接受，请重试或等待调用结束')
  return { state: data.state }
}
