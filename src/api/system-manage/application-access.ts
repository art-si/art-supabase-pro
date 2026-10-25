import type { ApplicationCode } from '@/config/application'
import { useSupabase } from '@/hooks/core/useSupabase'
import type { QueryResult } from '@/types/api/response'
import type { AppRouteRecord } from '@/types/router'

const { supabase, responseHandle } = useSupabase()

type AuthorizedMenuRow = Omit<AppRouteRecord, 'path'> & { path: string | null }

function isAuthorizedMenuRow(value: unknown): value is AuthorizedMenuRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.id === 'string' &&
    typeof row.name === 'string' &&
    (row.path === null || typeof row.path === 'string') &&
    (row.parentId === null || row.parentId === undefined || typeof row.parentId === 'string') &&
    row.meta !== null &&
    typeof row.meta === 'object' &&
    !Array.isArray(row.meta)
  )
}

/** 一次获取当前用户在已挂载应用内的授权菜单，服务端仍逐应用校验角色。 */
export async function fetchCurrentUserMenus(
  applicationCodes: ApplicationCode[],
  signal?: AbortSignal
) {
  const query = supabase.rpc('get_menus_for_current_applications', {
    p_app_codes: applicationCodes
  })
  const result = await responseHandle<Record<string, unknown>>(
    () => (signal ? query.abortSignal(signal) : query),
    {
      showMessage: false
    }
  )
  if (result.error) return { ...result, data: null }

  const data: Record<string, AppRouteRecord[]> = {}
  for (const code of applicationCodes) {
    const rows = result.data?.[code]
    if (!Array.isArray(rows) || !rows.every(isAuthorizedMenuRow)) {
      throw new Error('菜单服务返回的数据无效')
    }
    data[code] = rows.map((row) => ({ ...row, path: row.path ?? '' }))
  }
  return { ...result, data }
}

export interface AccessibleApplication {
  code: ApplicationCode
  name: string
  description: string | null
  baseUrl: string
  sort: number
}

const ACCESSIBLE_APPLICATIONS_CACHE_TTL_MS = 30_000
let accessibleApplicationsCache: { data: AccessibleApplication[]; fetchedAt: number } | undefined
let accessibleApplicationsRequest: Promise<QueryResult<AccessibleApplication[]>> | undefined
let accessibleApplicationsCacheVersion = 0

/** 登录身份切换时清理用户维度缓存，避免复用上一账号的应用范围。 */
export function clearAccessibleApplicationsCache(): void {
  accessibleApplicationsCacheVersion += 1
  accessibleApplicationsCache = undefined
  accessibleApplicationsRequest = undefined
}

function getCachedAccessibleApplications(): QueryResult<AccessibleApplication[]> | undefined {
  if (
    !accessibleApplicationsCache ||
    Date.now() - accessibleApplicationsCache.fetchedAt >= ACCESSIBLE_APPLICATIONS_CACHE_TTL_MS
  ) {
    return undefined
  }

  const data = accessibleApplicationsCache.data.slice()
  return { data, total: data.length, error: null }
}

async function requestAccessibleApplications(
  signal?: AbortSignal
): Promise<QueryResult<AccessibleApplication[]>> {
  const requestCacheVersion = accessibleApplicationsCacheVersion
  const query = supabase.rpc('get_accessible_applications')
  const result = await responseHandle<AccessibleApplication[]>(
    () => (signal ? query.abortSignal(signal) : query),
    {
      showMessage: false
    }
  )

  if (requestCacheVersion === accessibleApplicationsCacheVersion && !result.error && result.data) {
    accessibleApplicationsCache = {
      data: result.data.slice(),
      fetchedAt: Date.now()
    }
  }

  return result
}

/** 获取当前用户可进入的独立应用。 */
export async function fetchAccessibleApplications(signal?: AbortSignal) {
  const cached = getCachedAccessibleApplications()
  if (cached) return cached

  // 路由初始化携带的 signal 只服务当前导航，不能共享给壳层组件。
  if (signal) return await requestAccessibleApplications(signal)

  accessibleApplicationsRequest ??= requestAccessibleApplications().finally(() => {
    accessibleApplicationsRequest = undefined
  })
  return await accessibleApplicationsRequest
}
