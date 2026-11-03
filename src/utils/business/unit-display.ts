export interface UnitDisplayOption {
  id: string
  tenantId: string
  unitCode: string
  unitName: string
  symbol?: string | null
}

export interface UnitDisplayAlias {
  tenantId?: string
  value: string
  label?: string
  name: string
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

export function createUnitDisplayIndex(
  units: UnitDisplayOption[],
  aliases: UnitDisplayAlias[] = []
): UnitDisplayIndex {
  const index: UnitDisplayIndex = new Map()
  for (const unit of units) {
    const names = index.get(unit.tenantId) ?? new Map<string, string>()
    const label = formatUnitDisplayName(unit.unitName)
    for (const key of [unit.id, unit.unitCode, unit.unitName, unit.symbol]) {
      if (key) {
        names.set(key, label)
        names.set(key.toLowerCase(), label)
      }
    }
    index.set(unit.tenantId, names)
  }
  for (const alias of aliases) {
    if (!alias.tenantId || !alias.value) continue
    const names = index.get(alias.tenantId) ?? new Map<string, string>()
    const label = formatUnitDisplayName(alias.label || alias.name)
    names.set(alias.value, label)
    names.set(alias.value.toLowerCase(), label)
    index.set(alias.tenantId, names)
  }
  return index
}

export function resolveUnitDisplayName(
  index: UnitDisplayIndex,
  tenantId: string,
  value?: string | null
): string {
  if (!value) return '—'
  const names = index.get(tenantId)
  return names?.get(value) || names?.get(value.toLowerCase()) || formatUnitDisplayName(value)
}
