/* eslint-disable @typescript-eslint/no-explicit-any -- Legacy dynamic-field callbacks keep their indexable contract; data sources and selection events carry the caller's generic DTO type. */
import type { Component } from 'vue'
import type { DictColumnOption } from '@/types/component'
import type { ArtDialogSize } from '@/components/core/dialogs/art-dialog/types'

export type DataSelectKey = string | number
export type DataSelectMode = 'table' | 'tree'
export type DataSelectModelValue = DataSelectKey | DataSelectKey[] | undefined
export type MaybePromise<T> = T | Promise<T>

export interface DataSelectRecord {
  [key: string]: any
}

export interface DataSelectColumn<T extends object = DataSelectRecord> {
  prop: string
  label: string
  width?: string | number
  minWidth?: string | number
  align?: 'left' | 'center' | 'right'
  formatter?: (row: T) => string | number | Component
  dict?: DictColumnOption<T>
  tagType?:
    | 'primary'
    | 'success'
    | 'info'
    | 'warning'
    | 'danger'
    | ((row: T) => 'primary' | 'success' | 'info' | 'warning' | 'danger')
}

export interface DataSelectFilterOption {
  label: string
  value: string | number
}

/** Optional hierarchical navigator displayed beside a table data source. */
export interface DataSelectNavigation {
  /** Flat records; the selector builds the hierarchy from rowKey/parentKey. */
  data: DataSelectRecord[]
  title?: string
  rowKey?: string
  parentKey?: string
  labelKey?: string
  descriptionKey?: string
  childrenKey?: string
  /** Key added to apiFn.params.filters when a node is selected. */
  filterKey?: string
  allLabel?: string
  allDescription?: string
  searchPlaceholder?: string
  emptyText?: string
}

export interface DataSelectFetchParams {
  keyword: string
  page: number
  pageSize: number
  filters: Record<string, string | number | undefined>
}

export interface DataSelectFetchResult<T extends object = DataSelectRecord> {
  data?: T[]
  list?: T[]
  records?: T[]
  total?: number
  error?: unknown
}

export type DataSelectApiFn<T extends object = DataSelectRecord> = (
  params: DataSelectFetchParams
) => MaybePromise<DataSelectFetchResult<T> | T[]>

export interface ArtDataSelectProps<T extends object = DataSelectRecord> {
  modelValue?: DataSelectModelValue
  selectedData?: T[]
  /** Resolve saved keys before the picker opens; must enforce the owning source's read scope. */
  resolveSelected?: (keys: DataSelectKey[]) => MaybePromise<T[]>
  mode?: DataSelectMode
  multiple?: boolean
  /** 通过 open() 打开的选择器可隐藏触发区域，避免占用页面布局空间。 */
  showTrigger?: boolean
  data?: T[]
  /** Loading state for data fetched by the caller instead of apiFn. */
  loading?: boolean
  apiFn?: DataSelectApiFn<T>
  columns?: DataSelectColumn<T>[]
  title?: string
  subtitle?: string
  placeholder?: string
  searchPlaceholder?: string
  filterPlaceholder?: string
  filterKey?: string
  filterOptions?: DataSelectFilterOption[]
  navigation?: DataSelectNavigation
  rowKey?: string | ((row: T) => DataSelectKey)
  labelKey?: string | ((row: T) => string)
  descriptionKey?: string | ((row: T) => string)
  disabledKey?: string | ((row: T) => boolean)
  childrenKey?: string
  resultField?: string
  totalField?: string
  dialogWidth?: string | number | ArtDialogSize
  fullscreen?: boolean
  pageSize?: number
  pageSizes?: number[]
  showPagination?: boolean
  showSearch?: boolean
  showSelectedPanel?: boolean
  /** Start each dialog visit with an empty draft while retaining the confirmed field value. */
  resetDraftOnOpen?: boolean
  clearable?: boolean
  disabled?: boolean
  reserveSelected?: boolean
  treeCheckStrictly?: boolean
  maxTagCount?: number
  emptyText?: string
  emptyDescription?: string
}

export interface ArtDataSelectMultipleProps<T extends object = DataSelectRecord> extends Omit<
  ArtDataSelectProps<T>,
  'mode' | 'multiple' | 'modelValue'
> {
  modelValue?: DataSelectKey[]
}

export interface ArtDataSelectSingleProps<T extends object = DataSelectRecord> extends Omit<
  ArtDataSelectProps<T>,
  'mode' | 'multiple' | 'modelValue'
> {
  modelValue?: DataSelectKey
}

export interface ArtDataSelectEmits<T extends object = DataSelectRecord> {
  (e: 'update:modelValue', value: DataSelectModelValue): void
  (e: 'update:selectedData', value: T[]): void
  (e: 'change', value: DataSelectModelValue, rows: T[]): void
  (e: 'confirm', value: DataSelectModelValue, rows: T[]): void
  (e: 'clear'): void
  (e: 'open'): void
  (e: 'close'): void
  /** Raw diagnostic cause; the component owns inline recovery feedback, not a toast. */
  (e: 'load-error', error: unknown): void
}

export interface ArtDataSelectExpose {
  open: () => Promise<void>
  close: () => void
  clear: () => void
  reload: () => Promise<void>
}
