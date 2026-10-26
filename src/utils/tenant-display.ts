export interface TenantDisplayValue {
  tenant?: {
    tenantCode?: string | null
    tenantName?: string | null
  } | null
  tenantId?: string | null
}

export interface TenantSelectSource {
  id: string
  tenantCode?: string | null
  tenantName?: string | null
}

/** Format the tenant identity consistently in platform-wide tables and confirmations. */
export function formatTenantLabel(value: TenantDisplayValue, emptyText = '未识别租户'): string {
  const tenantName = value.tenant?.tenantName?.trim()
  const tenantCode = value.tenant?.tenantCode?.trim()
  if (tenantName && tenantCode) return `${tenantName}（${tenantCode}）`
  return tenantName || tenantCode || value.tenantId || emptyText
}

/** Build tenant selectors without repeating a missing name as `CODE（CODE）`. */
export function toTenantSelectOptions(
  tenants: readonly TenantSelectSource[]
): Array<{ label: string; value: string }> {
  return tenants.map((tenant) => {
    const code = tenant.tenantCode?.trim() ?? ''
    const name = tenant.tenantName?.trim() || code
    return {
      label: name && code && name !== code ? `${name}（${code}）` : name || tenant.id,
      value: tenant.id
    }
  })
}
