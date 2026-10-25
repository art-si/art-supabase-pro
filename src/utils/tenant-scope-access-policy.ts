const PLATFORM_CONTROL_PLANE_ROUTES = new Set(['/system/tenant'])

interface TenantScopeAccessPolicyInput {
  isAllTenants: boolean
  isPlatformSuper: boolean
  routePath: string
}

/** Resolve the aggregate-scope write guard without conflating it with button permissions. */
export function resolveTenantScopeReadOnly({
  isAllTenants,
  isPlatformSuper,
  routePath
}: TenantScopeAccessPolicyInput): boolean {
  return isAllTenants && !isPlatformSuper && !PLATFORM_CONTROL_PLANE_ROUTES.has(routePath)
}

interface TenantReadTargetInput {
  effectiveTenantId: string | null
  requestedTenantId?: string | null
  isPlatformSuper: boolean
}

/** Null means an authorized all-tenant read; undefined means the requested scope is invalid. */
export function resolveTenantReadTargetId({
  effectiveTenantId,
  requestedTenantId,
  isPlatformSuper
}: TenantReadTargetInput): string | null | undefined {
  const effectiveId = effectiveTenantId?.trim()
  const requestedId = requestedTenantId?.trim()

  if (isPlatformSuper && !effectiveId) return requestedId || null
  if (!effectiveId || (requestedId && requestedId !== effectiveId)) return undefined
  return effectiveId
}

interface TenantCreateScopeInput {
  effectiveTenantId: string | null
  isAllTenants: boolean
  isPlatformSuper: boolean
  tenantIds: readonly string[]
}

/** Root creations need explicit targets; only platform super may assign several tenants. */
export function areTenantCreateTargetsInScope({
  effectiveTenantId,
  isAllTenants,
  isPlatformSuper,
  tenantIds
}: TenantCreateScopeInput): boolean {
  if (!tenantIds.length || tenantIds.some((tenantId) => !tenantId.trim())) return false
  if (isPlatformSuper && isAllTenants) return true
  const selectedTenantId = effectiveTenantId?.trim()
  return Boolean(selectedTenantId && tenantIds.every((tenantId) => tenantId === selectedTenantId))
}
