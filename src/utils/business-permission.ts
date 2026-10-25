const BUSINESS_ROUTE_PREFIXES = ['/tms', '/vms', '/fms', '/hr'] as const

const ACTION_ALIASES: Record<string, string> = {
  add: 'Add',
  create: 'Add',
  edit: 'Edit',
  update: 'Edit',
  delete: 'Delete',
  remove: 'Delete',
  view: 'View',
  detail: 'View',
  import: 'Import',
  export: 'Export',
  sign: 'Sign'
}

export interface BusinessPermissionRoute {
  name?: unknown
  path?: string
}

const toPascalCase = (value: string): string =>
  value
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('')

export const isBusinessPermissionRoute = (route: BusinessPermissionRoute): boolean =>
  BUSINESS_ROUTE_PREFIXES.some(
    (prefix) => route.path === prefix || route.path?.startsWith(`${prefix}/`)
  )

export const normalizeBusinessPermissionAction = (action?: string | number): string | undefined => {
  if (typeof action !== 'string') return undefined
  const normalized = action.trim()
  if (!normalized || normalized === 'more') return undefined
  return ACTION_ALIASES[normalized.toLowerCase()] ?? toPascalCase(normalized)
}

/**
 * Resolve a business button permission. Explicit values always win; an empty explicit value opts out.
 * Business routes use a fail-closed `${menuName}:${action}` convention for standard actions.
 */
export const resolveBusinessButtonPermission = (
  route: BusinessPermissionRoute,
  action?: string | number,
  explicitPermission?: string
): string | undefined => {
  if (explicitPermission !== undefined) return explicitPermission.trim() || undefined
  if (!isBusinessPermissionRoute(route) || typeof route.name !== 'string') return undefined

  const normalizedAction = normalizeBusinessPermissionAction(action)
  return normalizedAction ? `${route.name}:${normalizedAction}` : undefined
}
