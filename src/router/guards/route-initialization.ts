// 首次鉴权导航可能需要等待 Supabase 冷启动并并行解析多个应用菜单 RPC。
// 12 秒会提前取消仍在正常处理的请求，因此保留更适合冷启动的等待窗口。
export const ROUTE_INITIALIZATION_STAGE_TIMEOUT_MS = 30_000
export const ROUTE_INITIALIZATION_TIMEOUT_RETRIES = 1
export const ROUTE_INITIALIZATION_TRANSIENT_RETRIES = 1
export const ROUTE_INITIALIZATION_RETRY_DELAY_MS = 200

export type RouteInitializationStage = 'user-profile' | 'menu-permissions'

const ROUTE_INITIALIZATION_ERROR_PATH = '/500'
const ROUTE_RECOVERY_BASE_URL = 'https://route-recovery.invalid'

export class RouteInitializationTimeoutError extends Error {
  constructor(
    readonly stage: RouteInitializationStage,
    readonly timeoutMs: number
  ) {
    super(`Route initialization timed out during ${stage} after ${timeoutMs}ms`)
    this.name = 'RouteInitializationTimeoutError'
  }
}

export class RouteInitializationAccessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RouteInitializationAccessError'
  }
}

/**
 * 为首次路由装配提供明确的等待上限，避免底层 SDK 请求悬挂时永久阻塞整个应用。
 * 底层请求仍负责自己的取消语义；本策略只保证路由层可及时进入恢复界面。
 */
export async function runRouteInitializationStage<T>(
  stage: RouteInitializationStage,
  operation: (signal: AbortSignal) => Promise<T>,
  options: {
    timeoutMs?: number
    timeoutRetries?: number
    transientRetries?: number
    retryDelayMs?: number
  } = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? ROUTE_INITIALIZATION_STAGE_TIMEOUT_MS
  const timeoutRetries = options.timeoutRetries ?? ROUTE_INITIALIZATION_TIMEOUT_RETRIES
  const transientRetries = options.transientRetries ?? ROUTE_INITIALIZATION_TRANSIENT_RETRIES
  const retryDelayMs = options.retryDelayMs ?? ROUTE_INITIALIZATION_RETRY_DELAY_MS
  let timeoutAttempt = 0
  let transientAttempt = 0

  while (true) {
    try {
      return await runBoundedOperation(stage, operation, timeoutMs)
    } catch (error) {
      if (error instanceof RouteInitializationTimeoutError && timeoutAttempt < timeoutRetries) {
        timeoutAttempt += 1
        continue
      }
      if (isTransientRouteInitializationError(error) && transientAttempt < transientRetries) {
        transientAttempt += 1
        await waitForRetry(retryDelayMs)
        continue
      }
      throw error
    }
  }
}

const transientErrorNames = new Set([
  'AuthRetryableFetchError',
  'NetworkError',
  'FetchError',
  'TimeoutError'
])
const transientMessagePattern =
  /failed to fetch|fetch failed|network request failed|networkerror|load failed|econnreset|etimedout|connection (?:reset|refused|closed)/i

function isErrorLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * 仅识别可安全重放的路由初始化网络故障。
 * 认证拒绝、权限错误和普通业务异常必须保持 fail-closed，不能自动重试掩盖。
 */
export function isTransientRouteInitializationError(error: unknown): boolean {
  let current: unknown = error
  const visited = new Set<unknown>()

  while (current && !visited.has(current)) {
    visited.add(current)
    if (current instanceof RouteInitializationAccessError) return false

    if (isErrorLike(current)) {
      const status = current.status ?? current.statusCode
      if (status === 401 || status === 403) return false
      if (typeof status === 'number' && (status === 429 || status >= 500)) return true

      const name = current.name
      if (typeof name === 'string' && transientErrorNames.has(name)) return true

      const message = current.message
      if (typeof message === 'string' && transientMessagePattern.test(message)) return true

      current = current.cause
      continue
    }

    return false
  }

  return false
}

async function waitForRetry(delayMs: number): Promise<void> {
  const boundedDelay = Math.max(0, Math.min(delayMs, 2_000))
  if (boundedDelay === 0) return
  await new Promise<void>((resolve) => setTimeout(resolve, boundedDelay))
}

async function runBoundedOperation<T>(
  stage: RouteInitializationStage,
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const abortController = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new RouteInitializationTimeoutError(stage, timeoutMs))
      // 先落定路由超时，再取消底层请求，避免 transport 的取消异常抢先结束竞态，
      // 从而绕过既定的超时重试策略。
      abortController.abort()
    }, timeoutMs)
  })

  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(abortController.signal)),
      timeoutPromise
    ])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

export function isRouteInitializationAccessError(
  error: unknown
): error is RouteInitializationAccessError {
  return error instanceof RouteInitializationAccessError
}

/**
 * 将异常页携带的恢复地址收敛为最初的站内目标。
 *
 * 旧版本可能把当前 500 地址再次写入 redirect，形成
 * `/500?redirect=/500?redirect=/...`。这里会逐层解包并拒绝站外地址，
 * 从而让重试和硬刷新始终回到同一个安全业务路由。
 */
export function resolveRouteInitializationTarget(requestedRedirect: unknown): string {
  let target = Array.isArray(requestedRedirect) ? requestedRedirect[0] : requestedRedirect
  const visitedTargets = new Set<string>()

  while (typeof target === 'string' && target.length > 0) {
    if (!target.startsWith('/') || target.startsWith('//') || visitedTargets.has(target)) {
      return '/'
    }
    visitedTargets.add(target)

    const parsedTarget = new URL(target, ROUTE_RECOVERY_BASE_URL)
    if (parsedTarget.pathname !== ROUTE_INITIALIZATION_ERROR_PATH) {
      return `${parsedTarget.pathname}${parsedTarget.search}${parsedTarget.hash}`
    }

    target = parsedTarget.searchParams.get('redirect')
  }

  return '/'
}
