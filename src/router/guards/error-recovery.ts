import type { Router } from 'vue-router'
import { finishPendingLoading } from './before-each'

const RECOVERY_QUERY_KEY = '__route_reload'
const RECOVERY_STORAGE_KEY = 'art-route-module-recovery'
const RECOVERY_TTL = 60_000
const MAX_RECOVERY_ATTEMPTS = 2
const MODULE_LOAD_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  'error loading dynamically imported module',
  'Unable to preload CSS'
]

interface RouteRecoveryState {
  path: string
  timestamp: number
  attempts: number
}

export function setupRouteErrorRecovery(router: Router): void {
  removeRecoveryQuery()

  router.onError((error, to) => {
    finishPendingLoading(to.fullPath)
    if (!isModuleLoadError(error)) {
      redirectToFailurePage(router, to.fullPath)
      return
    }

    const recoveryState = createRecoveryState(to.fullPath)
    if (!recoveryState) {
      redirectToFailurePage(router, to.fullPath)
      return
    }
    sessionStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(recoveryState))

    // 浏览器会缓存失败的模块导入及其依赖图；重走同一路由无法清除这个缓存。
    // 用完整文档加载恢复模块图，同时跨刷新保留次数上限，避免永久故障刷新死循环。
    reloadAtRoute(to.fullPath)
  })

  router.afterEach((to, _from, failure) => {
    if (failure) return

    // 打开 500 页不代表原页面已恢复，不能因此重置自动刷新的次数上限。
    if (readRecoveryState()?.path === to.fullPath) {
      sessionStorage.removeItem(RECOVERY_STORAGE_KEY)
    }
    removeRecoveryQuery()
  })
}

/** 用户主动重试时重新加载文档，清除失败模块缓存并开启一次新的恢复周期。 */
export function retryRouteWithFreshDocument(path: string): void {
  sessionStorage.removeItem(RECOVERY_STORAGE_KEY)
  reloadAtRoute(path)
}

function redirectToFailurePage(router: Router, targetPath: string): void {
  if (router.currentRoute.value.name === 'Exception500') return

  void router
    .replace({
      name: 'Exception500',
      query: { redirect: targetPath },
      replace: true
    })
    .catch((recoveryError: unknown) => {
      console.error('[RouteRecovery] 无法打开路由异常页:', recoveryError)
    })
}

function reloadAtRoute(path: string): void {
  const recoveryUrl = new URL(window.location.href)
  recoveryUrl.hash = path
  // A distinct document URL forces a real reload. Updating the hash first and
  // then calling reload() can expose the new address over the old route view.
  recoveryUrl.searchParams.set(RECOVERY_QUERY_KEY, String(Date.now()))
  window.location.replace(recoveryUrl.toString())
}

function isModuleLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return MODULE_LOAD_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
}

function createRecoveryState(path: string): RouteRecoveryState | undefined {
  const recoveryState = readRecoveryState()
  if (
    recoveryState &&
    recoveryState.path === path &&
    Date.now() - recoveryState.timestamp <= RECOVERY_TTL
  ) {
    if (recoveryState.attempts >= MAX_RECOVERY_ATTEMPTS) return undefined
    return { ...recoveryState, timestamp: Date.now(), attempts: recoveryState.attempts + 1 }
  }

  return { path, timestamp: Date.now(), attempts: 1 }
}

function readRecoveryState(): RouteRecoveryState | undefined {
  const storedValue = sessionStorage.getItem(RECOVERY_STORAGE_KEY)
  if (!storedValue) return undefined

  try {
    const parsedValue = JSON.parse(storedValue) as Partial<RouteRecoveryState>
    if (!parsedValue.path || !parsedValue.timestamp) return undefined
    return { ...parsedValue, attempts: parsedValue.attempts ?? 1 } as RouteRecoveryState
  } catch {
    sessionStorage.removeItem(RECOVERY_STORAGE_KEY)
    return undefined
  }
}

function removeRecoveryQuery(): void {
  const currentUrl = new URL(window.location.href)
  if (!currentUrl.searchParams.has(RECOVERY_QUERY_KEY)) return

  currentUrl.searchParams.delete(RECOVERY_QUERY_KEY)
  window.history.replaceState(window.history.state, '', currentUrl)
}
