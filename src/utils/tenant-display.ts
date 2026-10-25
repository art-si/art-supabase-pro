export interface TenantDisplayValue {
  tenant?: {
    tenantCode?: string | null
    tenantName?: string | null
  } | null
  tenantId?: string | null
}

/** Format the tenant identity consistently in platform-wide tables and confirmations. */
export function formatTenantLabel(value: TenantDisplayValue, emptyText = '未识别租户'): string {
  const tenantName = value.tenant?.tenantName?.trim()
  const tenantCode = value.tenant?.tenantCode?.trim()
  if (tenantName && tenantCode) return `${tenantName}（${tenantCode}）`
  return tenantName || tenantCode || value.tenantId || emptyText
}
