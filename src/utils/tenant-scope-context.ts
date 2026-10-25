import { uniq } from 'lodash-es'
import { isPlainObjectRecord } from './type-guards'

export const TENANT_SCOPE_HEADER = 'x-art-tenant-scope'
// CloudBase's PostgreSQL gateway permits this metadata header in CORS preflights.
// Its database tenant helpers read the same UUID from this provider-specific header.
export const CLOUDBASE_TENANT_SCOPE_HEADER = 'x-metadata'
export const TENANT_SCOPE_STORAGE_KEY = 'art-platform-tenant-scope-id'
export const TENANT_SCOPE_MODE_STORAGE_KEY = 'art-platform-tenant-scope-active'
let tenantScopeRevision = 0

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TABLES_WITH_EXPLICIT_TENANT_READ_FILTERS = new Set([
  'hr_candidate',
  'hr_competency',
  'hr_employee_competency',
  'hr_employee_contract',
  'hr_employee_qualification',
  'hr_personnel_change',
  'hr_position_competency',
  'hr_position_headcount',
  'hr_recruitment_requisition',
  'hr_training_enrollment',
  'hr_training_plan',
  'mdm_master_group',
  'mdm_document_type',
  'mdm_business_type',
  'mdm_equipment',
  'mdm_production_department',
  'mdm_production_personnel',
  'mdm_work_center',
  'mdm_work_center_defaults',
  'pmis_department_setting',
  'pmis_plan',
  'pmis_repair_task',
  'pmis_task',
  'scm_order_target_document',
  'sys_attachment',
  'sys_document_number_rule',
  'sys_role',
  'sys_user',
  'wms_purchase_document_list'
])

const DATA_API_PREFIXES = ['/rest/v1', '/v1/rdb/rest'] as const

const resolveDataApiPrefix = (pathname: string): string | null =>
  DATA_API_PREFIXES.find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ??
  null

const tenantIdFromRecord = (value: unknown): string | null => {
  if (!isPlainObjectRecord(value)) return null
  const candidates = [
    value.tenant_id,
    ...[value.p_header, value.p_payload, value.p_document].map((record) =>
      isPlainObjectRecord(record) ? record.tenant_id : undefined
    )
  ]
  const tenantId = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && UUID_PATTERN.test(candidate)
  )
  return tenantId ?? null
}

/** Resolve an explicit write target from a PostgREST table or RPC JSON body. */
export const readMutationTenantScopeId = (body: BodyInit | null | undefined): string | null => {
  if (typeof body !== 'string' || !body.trim()) return null
  try {
    const payload: unknown = JSON.parse(body)
    if (Array.isArray(payload)) {
      const tenantIds = uniq(payload.map(tenantIdFromRecord).filter(Boolean))
      return tenantIds.length === 1 ? (tenantIds[0] ?? null) : null
    }
    return tenantIdFromRecord(payload)
  } catch {
    return null
  }
}

export const shouldAttachTenantScopeHeader = (requestUrl: string): boolean => {
  try {
    const { pathname } = new URL(requestUrl, 'http://localhost')
    return Boolean(resolveDataApiPrefix(pathname))
  } catch {
    return false
  }
}

export const readTenantScopeId = (): string | null => {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const value = sessionStorage.getItem(TENANT_SCOPE_STORAGE_KEY)?.trim()
    return value && UUID_PATTERN.test(value) ? value : null
  } catch {
    return null
  }
}

/** Whether the current browser session belongs to the platform-wide tenant console. */
export const readPlatformTenantScopeActive = (): boolean => {
  if (typeof sessionStorage === 'undefined') return false
  try {
    return sessionStorage.getItem(TENANT_SCOPE_MODE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Legacy pages sometimes hard-code the authenticated platform tenant into read queries. The
 * platform shell is the canonical read scope, so remove only top-level/nested tenant_id filters
 * from table reads and let the database scope policy apply "all" or the selected tenant.
 */
export const normalizePlatformTenantReadUrl = (requestUrl: string): string => {
  try {
    const url = new URL(requestUrl)
    const dataApiPrefix = resolveDataApiPrefix(url.pathname)
    if (!dataApiPrefix || url.pathname.startsWith(`${dataApiPrefix}/rpc/`)) {
      return requestUrl
    }

    // These reads use tenant_id as an intentional target selector, including user/role filters,
    // tenant-owned reference lists, and attachment deduplication.
    if (TABLES_WITH_EXPLICIT_TENANT_READ_FILTERS.has(url.pathname.split('/').at(-1) ?? '')) {
      return requestUrl
    }

    const tenantFilterKeys = [...url.searchParams.keys()].filter((key) =>
      /(^|\.)tenant_id$/i.test(key)
    )
    tenantFilterKeys.forEach((key) => url.searchParams.delete(key))
    return url.toString()
  } catch {
    return requestUrl
  }
}

/**
 * Resolve an optional tenant query parameter against the platform scope selected in the shell.
 * Explicit feature parameters always win; ordinary tenant users have no stored platform scope
 * and continue to rely on the server-side tenant boundary.
 */
export const resolveTenantScopeId = (explicitTenantId?: string | null): string | undefined =>
  explicitTenantId?.trim() || readTenantScopeId() || undefined

/**
 * Tenant-bound configuration workspaces cannot aggregate records across tenants. In platform
 * "all tenants" mode they use the signed-in platform tenant as a read-only preview target, while
 * a concrete shell selection always takes precedence.
 */
export const resolveTenantWorkspaceId = (
  effectiveTenantId?: string | null,
  homeTenantId?: string | null
): string => effectiveTenantId?.trim() || homeTenantId?.trim() || ''

/** Resolve a tenant-owned write; all-tenant creates default to the actor's home tenant. */
export const resolveTenantWriteTargetId = (options: {
  explicitTenantId?: string | null
  effectiveTenantId?: string | null
  actorTenantId?: string | null
  canWriteToOtherTenant: boolean
}): string => {
  const targetTenantId =
    options.explicitTenantId?.trim() ||
    options.effectiveTenantId?.trim() ||
    options.actorTenantId?.trim()
  if (!targetTenantId) throw new Error('请先选择目标租户')
  if (!UUID_PATTERN.test(targetTenantId)) throw new Error('目标租户无效，请重新选择')
  const selectedTenantId = options.effectiveTenantId?.trim()
  if (selectedTenantId && targetTenantId !== selectedTenantId) {
    throw new Error('目标租户与当前选择不一致，请切换租户后重试')
  }
  if (!options.canWriteToOtherTenant && targetTenantId !== options.actorTenantId) {
    throw new Error('只能操作当前账号所属租户的数据')
  }
  return targetTenantId
}

export const writeTenantScopeId = (tenantId: string | null): void => {
  if (typeof sessionStorage === 'undefined') return
  const previousTenantId = readTenantScopeId()
  try {
    if (tenantId) {
      sessionStorage.setItem(TENANT_SCOPE_STORAGE_KEY, tenantId)
    } else {
      sessionStorage.removeItem(TENANT_SCOPE_STORAGE_KEY)
    }
  } catch {
    // 浏览器禁用会话存储时退化为当前页面生命周期内的状态。
  }
  if (readPlatformTenantScopeActive() && previousTenantId !== readTenantScopeId())
    tenantScopeRevision += 1
}

export const writePlatformTenantScopeActive = (active: boolean): void => {
  if (typeof sessionStorage === 'undefined') return
  const previousActive = readPlatformTenantScopeActive()
  try {
    if (active) {
      sessionStorage.setItem(TENANT_SCOPE_MODE_STORAGE_KEY, '1')
    } else {
      sessionStorage.removeItem(TENANT_SCOPE_MODE_STORAGE_KEY)
    }
  } catch {
    // 浏览器禁用会话存储时退化为当前页面生命周期内的状态。
  }
  if (previousActive !== readPlatformTenantScopeActive()) tenantScopeRevision += 1
}

/** Reject stale client reads; this guard grants no tenant or business permission. */
export const createTenantScopeReadGuard = (): (() => void) => {
  const revision = tenantScopeRevision
  const platformActive = readPlatformTenantScopeActive()
  const tenantId = platformActive ? readTenantScopeId() : null
  return () => {
    if (
      revision !== tenantScopeRevision ||
      platformActive !== readPlatformTenantScopeActive() ||
      (platformActive && tenantId !== readTenantScopeId())
    ) {
      throw new Error('租户范围已变化，请刷新后重试')
    }
  }
}
