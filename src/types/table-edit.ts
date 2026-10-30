import type { TableColumnValidationRule } from './component'

export interface TableEditContext<T = Record<string, unknown>> {
  row: T
  rowIndex: number
  prop: string
  value: unknown
  cell?: HTMLElement
}

/** Opt-in editing of an isolated working copy. Persistence belongs to the caller. */
export interface TableEditConfig<T = Record<string, unknown>> {
  enabled?: boolean
  mode?: 'cell' | 'row'
  /** External editors are owned by the caller, e.g. SQL cell popovers. */
  editor?: 'inline' | 'external'
  trigger?: 'click' | 'dblclick' | 'manual'
  beforeEditMethod?: (context: TableEditContext<T>) => boolean
  historyLimit?: number
  onlyChanged?: boolean
}

export interface TableEditRender<T = Record<string, unknown>> {
  name?: 'input' | 'textarea' | 'number' | 'select' | 'switch' | 'date' | 'datetime'
  enabled?: boolean
  disabled?: boolean | ((context: TableEditContext<T>) => boolean)
  nullable?: boolean
  placeholder?: string
  options?: Array<{ label: string; value: string | number | boolean; disabled?: boolean }>
  min?: number
  max?: number
  precision?: number
  maxLength?: number
  activeValue?: boolean | string | number
  inactiveValue?: boolean | string | number
  /** Override the built-in editor through a named ArtTable slot. */
  slot?: `${string}-edit`
}

export type TableEditRules<T = Record<string, unknown>> = Record<
  string,
  TableColumnValidationRule<T> | TableColumnValidationRule<T>[]
>

export interface TableEditChange<T = Record<string, unknown>> {
  rowIndex: number
  row: T
  original: T
  fields: string[]
}

export interface TableEditRecordset<T = Record<string, unknown>> {
  insertRecords: T[]
  removeRecords: T[]
  updateRecords: T[]
  changes: TableEditChange<T>[]
}

export interface TableEditApi<T = Record<string, unknown>> {
  getTableData: () => T[]
  getRecordset: () => TableEditRecordset<T>
  getInsertRecords: () => T[]
  getRemoveRecords: () => T[]
  getUpdateRecords: () => T[]
  isUpdateByRow: (row: T, prop?: string) => boolean
  revertData: (row?: T, prop?: string) => void
  insertAt: (records: T | T[], target?: T | -1) => T[]
  remove: (rows: T | T[]) => T[]
  setCellValue: (row: T, prop: string, value: unknown) => boolean
  setEditCell: (row: T, prop: string) => Promise<boolean>
  setEditRow: (row: T) => Promise<boolean>
  clearEdit: () => void
  getEditRecord: () => TableEditContext<T> | null
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}
