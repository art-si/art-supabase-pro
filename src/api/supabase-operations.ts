import { requestLocalExecutor } from './local-executor'
import { isOperationRun } from '@/utils/supabase/operations-catalog'
import type {
  OperationRun,
  OperationsSnapshot,
  SupabaseOperationId
} from '@/types/supabase-operations'

export interface OperationsConnection {
  port: number
}

export async function requestOperations<T>(
  connection: OperationsConnection,
  route: string,
  body?: unknown
): Promise<T> {
  if (!Number.isInteger(connection.port) || connection.port < 1024 || connection.port > 65535)
    throw new Error('请输入有效的本机执行端端口。')
  try {
    // Each caller validates its own DTO after the shared authenticated transport.
    return (await requestLocalExecutor(`http://127.0.0.1:${connection.port}`, route, body)) as T
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes('配对码'))
      throw new Error(
        '当前运行的是旧版执行端。请在原窗口按 Ctrl+C 结束，再重新运行 pnpm supabase:ops；新版不需要配对码。',
        { cause }
      )
    if (cause instanceof Error && cause.message.startsWith('无法连接执行端'))
      throw new Error(
        `无法连接本机执行端（端口 ${connection.port}）。请在仓库终端运行 pnpm supabase:ops 后重试。`,
        { cause }
      )
    throw cause
  }
}

export async function fetchOperationsSnapshot(
  connection: OperationsConnection,
  selectedRunId = ''
): Promise<OperationsSnapshot> {
  const result = await requestOperations<OperationsSnapshot>(
    connection,
    `/runs?selected=${encodeURIComponent(selectedRunId)}`
  )
  if (
    !result ||
    !Array.isArray(result.runs) ||
    !result.runs.every(isOperationRun) ||
    typeof result.busy !== 'boolean' ||
    (result.externalActivity !== undefined &&
      (!result.externalActivity ||
        !['running', 'unknown'].includes(result.externalActivity.state) ||
        typeof result.externalActivity.stage !== 'string' ||
        typeof result.externalActivity.message !== 'string')) ||
    result.projectRef !== 'ckbftoopuyophiebamwy'
  )
    throw new Error('执行端返回了不匹配的项目或任务数据。')
  return result
}
export async function startSupabaseOperation(
  connection: OperationsConnection,
  operationId: SupabaseOperationId,
  parameters: Record<string, string | boolean>
): Promise<OperationRun> {
  const result = await requestOperations<OperationRun>(connection, '/runs', {
    operationId,
    parameters
  })
  if (!isOperationRun(result) || result.operationId !== operationId)
    throw new Error('执行端没有返回有效任务，请刷新后核对任务记录。')
  return result
}
export async function cancelSupabaseOperation(
  connection: OperationsConnection,
  id: string
): Promise<void> {
  if (!/^[a-f\d-]{36}$/.test(id)) throw new Error('任务编号无效，请刷新任务记录。')
  await requestOperations(connection, `/runs/${id}/cancel`, {})
}

export async function cancelDetachedSupabaseExports(
  connection: OperationsConnection
): Promise<number> {
  const result = await requestOperations<{ stopped: number }>(
    connection,
    '/detached-exports/cancel',
    {}
  )
  if (!result || !Number.isSafeInteger(result.stopped) || result.stopped < 0)
    throw new Error('停止结果未能确认，请刷新并核对 Docker 状态。')
  return result.stopped
}
