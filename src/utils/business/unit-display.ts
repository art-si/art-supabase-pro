export interface UnitDisplayOption {
  id: string
  tenantId: string
  unitCode: string
  unitName: string
}

export type UnitDisplayIndex = Map<string, Map<string, string>>

const unitNameAliases = new Map([
  ['kg', '千克'],
  ['pc', '件'],
  ['pcs', '件'],
  ['piece', '件'],
  ['item', '件']
])

export function formatUnitDisplayName(value?: string | null, emptyValue = '—'): string {
  if (!value) return emptyValue
  return unitNameAliases.get(value.trim().toLowerCase()) || value
}

export function createUnitDisplayIndex(units: UnitDisplayOption[]): UnitDisplayIndex {
  const index: UnitDisplayIndex = new Map()
  for (const unit of units) {
    const names = index.get(unit.tenantId) ?? new Map<string, string>()
    for (const key of [unit.id, unit.unitCode, unit.unitName]) {
      if (key) names.set(key, unit.unitName)
    }
    index.set(unit.tenantId, names)
  }
  return index
}

export function resolveUnitDisplayName(
  index: UnitDisplayIndex,
  tenantId: string,
  value?: string | null
): string {
  if (!value) return '—'
  const name = index.get(tenantId)?.get(value) || value
  return formatUnitDisplayName(name)
}
