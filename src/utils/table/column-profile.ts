import type { ColumnOption } from '@/types/component'
import type { TableColumnProfile, TableColumnSetting } from '@/types/table-column-config'

export function getColumnKey<T>(column: ColumnOption<T>): string {
  return column.type
    ? `__${column.type}__`
    : (column.prop ?? (column.children?.length ? `__group__${column.label ?? ''}` : ''))
}

/** Leave enough room for the label and independently operated header controls. */
export function fitColumnHeaderControls<T>(column: ColumnOption<T>): ColumnOption<T> {
  const filtered = Boolean(column.filterType && column.filterType !== 'none')
  if (!column.sortable && !filtered) return column
  const minimumWidth = Math.max(
    100,
    (column.label?.length ?? 0) * 14 + (column.sortable ? 52 : 24) + (filtered ? 28 : 0)
  )
  const width = Number(column.width)
  return {
    ...column,
    ...(width > 0 ? { width: Math.max(width, minimumWidth) } : {}),
    minWidth: Math.max(Number(column.minWidth) || 0, minimumWidth)
  }
}

export function hasVisibleBusinessColumn(
  settings: TableColumnSetting[],
  catalog: TableColumnSetting[]
): boolean {
  return visibleColumnSettings(settings, catalog).some(
    (column) =>
      !column.key.startsWith('__group__') &&
      !['__selection__', '__index__', '__globalIndex__', '__expand__', 'operation'].includes(
        column.key
      )
  )
}

export function visibleColumnSettings(
  settings: TableColumnSetting[],
  catalog: TableColumnSetting[]
): TableColumnSetting[] {
  const hidden = new Set(settings.filter((column) => !column.visible).map((column) => column.key))
  const parents = new Map(catalog.map((column) => [column.key, column.parentKey]))
  return settings.filter((column) => {
    if (!column.visible) return false
    const visited = new Set<string>()
    let key: string | undefined = column.key
    while (key) {
      if (hidden.has(key) || visited.has(key)) return false
      visited.add(key)
      key = parents.get(key)
    }
    return true
  })
}

/** A layout can only rearrange columns which the authorized factory actually produced. */
export function applyColumnProfile<T>(
  original: ColumnOption<T>[],
  settings: TableColumnSetting[],
  defaults: TableColumnSetting[] = []
): ColumnOption<T>[] {
  const savedKeys = new Set(settings.map((setting) => setting.key))
  const complete = [...settings, ...defaults.filter((setting) => !savedKeys.has(setting.key))]
  const settingsByKey = new Map(complete.map((setting, index) => [setting.key, { setting, index }]))
  return original
    .map((column, index) => {
      const children = column.children?.length
        ? applyColumnProfile(column.children, settings, defaults).filter(
            (child) => child.visible !== false && child.checked !== false
          )
        : undefined
      const configured = settingsByKey.get(getColumnKey(column))
      if (!configured)
        return {
          column: children
            ? { ...column, children, ...(children.length ? {} : { visible: false }) }
            : column,
          order: settings.length + index
        }
      const { setting } = configured
      const structural = Boolean(column.type || column.prop === 'operation' || column.disabled)
      const sourceHidden =
        column.visible === false &&
        defaults.find((item) => item.key === getColumnKey(column))?.visible !== false
      return {
        order: configured.index,
        column: {
          ...column,
          ...(children ? { children } : {}),
          label: structural ? column.label : setting.label || column.label,
          visible:
            sourceHidden || children?.length === 0 ? false : structural ? true : setting.visible,
          checked:
            sourceHidden || children?.length === 0 ? false : structural ? true : setting.visible,
          width: setting.width,
          minWidth: setting.minWidth,
          ...(!structural && setting.filterType ? { filterType: setting.filterType } : {}),
          ...(setting.fixed !== undefined && !structural ? { fixed: setting.fixed } : {}),
          ...(setting.align ? { align: setting.align } : {}),
          ...(typeof setting.sortable === 'boolean' && !structural
            ? {
                sortable: setting.sortable
                  ? column.sortable === 'custom'
                    ? ('custom' as const)
                    : true
                  : false
              }
            : {}),
          ...(typeof setting.showOverflowTooltip === 'boolean'
            ? { showOverflowTooltip: setting.showOverflowTooltip }
            : {})
        }
      }
    })
    .sort((a, b) => a.order - b.order)
    .map(({ column }) => column)
}

export function resolveColumnProfiles(profiles: TableColumnProfile[]): {
  configured: boolean
  columns: TableColumnSetting[]
} {
  let configured = false
  let columns: TableColumnSetting[] = []
  const rank = { platform: 0, tenant: 1, role: 2, user: 3 }
  const ordered = [...profiles].sort(
    (a, b) => rank[a.scope] - rank[b.scope] || a.priority - b.priority || a.id.localeCompare(b.id)
  )
  for (const profile of ordered) {
    if (profile.source !== 'inherit') configured = profile.source === 'configured'
    if (profile.columns.length) {
      const overrides = new Map(profile.columns.map((column) => [column.key, column]))
      columns = [
        ...profile.columns.map((column) => ({
          ...columns.find((inherited) => inherited.key === column.key),
          ...column,
          // Each saved row owns its size; omitted dimensions mean automatic sizing.
          width: column.width,
          minWidth: column.minWidth
        })),
        ...columns.filter((column) => !overrides.has(column.key))
      ]
    }
  }
  return { configured, columns }
}

/** Excludes detail/picker tables that happen to live on the same route. */
export function matchesColumnCatalog<T>(
  columns: ColumnOption<T>[],
  keys: string[],
  catalog: TableColumnSetting[] = []
): boolean {
  const groups = new Set(catalog.flatMap((column) => column.groups ?? []))
  if (groups.size)
    return [...groups].some((group) =>
      matchesColumnCatalog(
        columns,
        catalog.filter((column) => column.groups?.includes(group)).map((column) => column.key)
      )
    )
  if (catalog.some((column) => column.parentKey))
    keys = catalog.filter((column) => !column.parentKey).map((column) => column.key)
  const business = columns.filter((column) => !column.type && column.prop !== 'operation')
  const known = new Set(keys)
  return (
    business.length > 0 &&
    business.every((column) => known.has(getColumnKey(column))) &&
    business.length >=
      Math.max(1, keys.filter((key) => !key.startsWith('__') && key !== 'operation').length * 0.6)
  )
}
