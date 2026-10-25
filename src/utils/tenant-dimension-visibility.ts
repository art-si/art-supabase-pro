export interface TenantDimensionDescriptor {
  key?: unknown
  prop?: unknown
  label?: unknown
}

const TENANT_FIELD_KEYS = new Set([
  'tenant',
  'tenantid',
  'tenantids',
  'tenantname',
  'tenantcode',
  'tenantidentity'
])

const normalizeFieldSegment = (value: string): string =>
  value.replaceAll('_', '').replaceAll('-', '').toLowerCase()

export const isTenantDimensionDescriptor = (descriptor: TenantDimensionDescriptor): boolean => {
  if (typeof descriptor.label === 'string' && descriptor.label.includes('租户')) return true

  return [descriptor.key, descriptor.prop].some((value) => {
    if (typeof value !== 'string') return false
    return value.split('.').some((segment) => TENANT_FIELD_KEYS.has(normalizeFieldSegment(segment)))
  })
}

export const filterTenantDimensionDescriptors = <T extends TenantDimensionDescriptor>(
  descriptors: T[],
  canViewTenantDimension: boolean
): T[] =>
  canViewTenantDimension
    ? descriptors
    : descriptors.filter((descriptor) => !isTenantDimensionDescriptor(descriptor))
