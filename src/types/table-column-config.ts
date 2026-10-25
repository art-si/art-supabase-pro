/** Serializable presentation settings. Renderers and access rules remain in source code. */
export interface TableColumnSetting {
  key: string
  label: string
  visible: boolean
  width?: number
  minWidth?: number
  fixed?: false | 'left' | 'right'
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
  showOverflowTooltip?: boolean
  filterType?: TableColumnFilterType
  locked?: boolean
  /** Static membership of keyed variants rendered by one menu's list component. */
  groups?: string[]
  parentKey?: string
}

export type TableColumnFilterType =
  'none' | 'text' | 'select' | 'number-range' | 'date-range' | 'datetime-range'

export type TableColumnScope = 'platform' | 'tenant' | 'role' | 'user'
export interface TableColumnSubject {
  value: string
  label: string
  roleIds?: string[]
}
export type TableColumnSource = 'inherit' | 'frontend' | 'configured'

export interface TableColumnCatalog {
  menuId: string
  routePath: string
  sourceFile: string
  columns: TableColumnSetting[]
  searchKeys: string[]
  revision: string
}

export interface TableColumnProfile {
  id: string
  menuId: string
  scope: TableColumnScope
  tenantId: string | null
  subjectId: string | null
  source: TableColumnSource
  columns: TableColumnSetting[]
  priority: number
  revision: number
  updatedAt: string
}

export interface TableColumnRuntime {
  enabled: boolean
  catalog: TableColumnCatalog | null
  profiles: TableColumnProfile[]
}

export interface TableColumnAdminContext {
  catalogs: TableColumnCatalog[]
  menus: Array<{
    id: string
    parentId: string | null
    name: string
    path: string
    type: string
    sort: number
    component: string
    meta: { title: string; icon?: string }
  }>
}
