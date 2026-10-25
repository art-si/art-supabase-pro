import { useSupabase } from '@/hooks/core/useSupabase'
import type {
  TableColumnAdminContext,
  TableColumnCatalog,
  TableColumnProfile,
  TableColumnRuntime,
  TableColumnScope,
  TableColumnSource,
  TableColumnSubject,
  TableColumnSetting
} from '@/types/table-column-config'
import { isPlainObjectRecord } from '@/utils/type-guards'
import configuredTableRoutes from '@/config/table-column-routes.generated.json'
import tableColumnCatalogUrl from '@/config/table-column-catalog.generated.json?url'

const registeredRoutes = new Set(configuredTableRoutes)

const { supabase, responseHandle } = useSupabase()

/** RPC DTOs use explicit camel-case keys; reject malformed JSON before the UI consumes it. */
function readColumns(value: unknown): TableColumnSetting[] {
  if (!Array.isArray(value)) throw new Error('列配置格式不正确，请刷新后重试')
  return value.map((item: unknown) => {
    if (
      !isPlainObjectRecord(item) ||
      typeof item.key !== 'string' ||
      typeof item.label !== 'string' ||
      typeof item.visible !== 'boolean'
    )
      throw new Error('列配置格式不正确，请刷新后重试')
    return {
      key: item.key,
      label: item.label,
      visible: item.visible,
      ...(typeof item.width === 'number' ? { width: item.width } : {}),
      ...(typeof item.minWidth === 'number' ? { minWidth: item.minWidth } : {}),
      ...(item.fixed === false || item.fixed === 'left' || item.fixed === 'right'
        ? { fixed: item.fixed }
        : {}),
      ...(item.align === 'left' || item.align === 'center' || item.align === 'right'
        ? { align: item.align }
        : {}),
      ...(typeof item.sortable === 'boolean' ? { sortable: item.sortable } : {}),
      ...(['none', 'text', 'select', 'number-range', 'date-range', 'datetime-range'].includes(
        String(item.filterType)
      )
        ? { filterType: item.filterType as TableColumnSetting['filterType'] }
        : {}),
      ...(typeof item.showOverflowTooltip === 'boolean'
        ? { showOverflowTooltip: item.showOverflowTooltip }
        : {}),
      ...(typeof item.locked === 'boolean' ? { locked: item.locked } : {}),
      ...(typeof item.parentKey === 'string' ? { parentKey: item.parentKey } : {}),
      ...(Array.isArray(item.groups)
        ? { groups: item.groups.filter((group): group is string => typeof group === 'string') }
        : {})
    }
  })
}

function readCatalog(value: unknown): TableColumnCatalog {
  if (
    !isPlainObjectRecord(value) ||
    typeof value.menuId !== 'string' ||
    typeof value.routePath !== 'string' ||
    typeof value.sourceFile !== 'string' ||
    typeof value.revision !== 'string'
  )
    throw new Error('列目录格式不正确，请重新同步目录')
  return {
    menuId: value.menuId,
    routePath: value.routePath,
    sourceFile: value.sourceFile,
    revision: value.revision,
    columns: readColumns(value.columns),
    searchKeys: Array.isArray(value.searchKeys)
      ? value.searchKeys.filter((key): key is string => typeof key === 'string')
      : []
  }
}

function readProfile(value: unknown): TableColumnProfile {
  if (
    !isPlainObjectRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.menuId !== 'string' ||
    !['platform', 'tenant', 'role', 'user'].includes(String(value.scope)) ||
    !['inherit', 'frontend', 'configured'].includes(String(value.source)) ||
    typeof value.revision !== 'number' ||
    typeof value.priority !== 'number' ||
    typeof value.updatedAt !== 'string'
  )
    throw new Error('列方案格式不正确，请刷新后重试')
  const scope = value.scope as TableColumnScope
  const source = value.source as TableColumnSource
  return {
    id: value.id,
    menuId: value.menuId,
    scope,
    source,
    revision: value.revision,
    priority: value.priority,
    updatedAt: value.updatedAt,
    tenantId: typeof value.tenantId === 'string' ? value.tenantId : null,
    subjectId: typeof value.subjectId === 'string' ? value.subjectId : null,
    columns: readColumns(value.columns)
  }
}

async function rpc(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await responseHandle<unknown>(() => supabase.rpc(name, args), {
    convertToCamel: false,
    showErrorMessage: false
  })
  if (error) throw error
  return data
}

export async function fetchTableColumnRuntime(routePath: string): Promise<TableColumnRuntime> {
  const value = await rpc('get_table_column_runtime', { p_route_path: routePath })
  if (
    !isPlainObjectRecord(value) ||
    typeof value.enabled !== 'boolean' ||
    !Array.isArray(value.profiles)
  )
    throw new Error('列方案读取失败，请重试')
  return {
    enabled: value.enabled,
    catalog: value.catalog ? readCatalog(value.catalog) : null,
    profiles: value.profiles.map(readProfile)
  }
}

export async function fetchTableColumnAdmin(): Promise<TableColumnAdminContext> {
  const value = await rpc('get_table_column_admin')
  if (!isPlainObjectRecord(value) || !Array.isArray(value.catalogs) || !Array.isArray(value.menus))
    throw new Error('列配置目录读取失败，请重试')
  return {
    catalogs: value.catalogs
      .map(readCatalog)
      .filter((catalog) => registeredRoutes.has(catalog.routePath)),
    menus: value.menus.map((menu: unknown) => {
      if (
        !isPlainObjectRecord(menu) ||
        typeof menu.id !== 'string' ||
        typeof menu.name !== 'string' ||
        typeof menu.path !== 'string' ||
        !isPlainObjectRecord(menu.meta) ||
        typeof menu.meta.title !== 'string'
      )
        throw new Error('功能菜单目录格式不正确，请刷新后重试')
      return {
        id: menu.id,
        name: menu.name,
        path: menu.path,
        parentId: typeof menu.parentId === 'string' ? menu.parentId : null,
        component: typeof menu.component === 'string' ? menu.component : '',
        type: typeof menu.type === 'string' ? menu.type : 'menu',
        sort: typeof menu.sort === 'number' ? menu.sort : 0,
        meta: {
          title: menu.meta.title,
          ...(typeof menu.meta.icon === 'string' ? { icon: menu.meta.icon } : {})
        }
      }
    })
  }
}

export async function fetchTableColumnProfiles(menuId: string): Promise<TableColumnProfile[]> {
  const value = await rpc('get_table_column_profiles', { p_menu_id: menuId })
  if (!Array.isArray(value)) throw new Error('列方案读取失败，请重试')
  return value.map(readProfile)
}

export async function fetchTableColumnSubjects(
  tenantId: string,
  scope: 'role' | 'user'
): Promise<TableColumnSubject[]> {
  const value = await rpc('get_table_column_subjects', { p_tenant_id: tenantId, p_scope: scope })
  if (!Array.isArray(value)) throw new Error('配置对象加载失败，请重试')
  return value.map((item: unknown) => {
    if (
      !isPlainObjectRecord(item) ||
      typeof item.value !== 'string' ||
      typeof item.label !== 'string'
    )
      throw new Error('配置对象格式不正确，请重试')
    return {
      value: item.value,
      label: item.label,
      ...(Array.isArray(item.roleIds)
        ? { roleIds: item.roleIds.filter((id): id is string => typeof id === 'string') }
        : {})
    }
  })
}

export async function saveTableColumnProfile(params: {
  menuId: string
  scope: TableColumnScope
  tenantId: string | null
  subjectId: string | null
  source: TableColumnSource
  columns: TableColumnSetting[]
  priority: number
  expectedRevision: number
}): Promise<void> {
  await rpc('save_table_column_profile', { p_config: params })
}

export async function syncTableColumnCatalog(): Promise<number> {
  let response: Response
  try {
    response = await fetch(tableColumnCatalogUrl, { credentials: 'same-origin' })
  } catch (cause) {
    throw new Error('列目录文件加载失败，请检查网络后重试', { cause })
  }
  if (!response.ok) throw new Error('列目录文件加载失败，请刷新后重试')

  let rawCatalog: unknown
  try {
    rawCatalog = await response.json()
  } catch (cause) {
    throw new Error('列目录文件解析失败，请重新构建并部署系统', { cause })
  }
  if (!Array.isArray(rawCatalog)) throw new Error('列目录文件格式不正确，请重新构建并部署系统')
  const catalog = rawCatalog.map(readCatalog)
  const value = await rpc('sync_table_column_catalog', { p_catalogs: catalog })
  if (typeof value !== 'number') throw new Error('列目录同步结果无效，请刷新后核对')
  return value
}
