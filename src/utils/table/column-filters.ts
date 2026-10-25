import dayjs from 'dayjs'
import { get, uniqBy } from 'lodash-es'
import type { ColumnOption } from '@/types/component'
import type { TableColumnFilterType } from '@/types/table-column-config'

export const TABLE_COLUMN_FILTER_OPTIONS: Array<{ value: TableColumnFilterType; label: string }> = [
  { value: 'none', label: '不过滤' },
  { value: 'text', label: '文本搜索' },
  { value: 'select', label: '复选框多选' },
  { value: 'number-range', label: '数值范围' },
  { value: 'date-range', label: '日期区间' },
  { value: 'datetime-range', label: '日期时间区间' }
]

export interface ColumnFilterCondition {
  text?: string
  values?: string[]
  start?: string | number
  end?: string | number
  empty?: 'empty' | 'not-empty'
}

export const isEmptyColumnValue = (value: unknown): boolean =>
  value == null || (typeof value === 'string' && value.trim() === '')

export function columnFilterValueKey(value: unknown): string {
  if (isEmptyColumnValue(value)) return 'empty'
  return JSON.stringify([typeof value, String(value)])
}

export function columnFilterOptions<T>(
  rows: T[],
  prop: string
): Array<{ value: string; label: string; raw: unknown }> {
  return uniqBy(
    rows.map((row) => {
      const raw: unknown = get(row, prop)
      return {
        value: columnFilterValueKey(raw),
        label: isEmptyColumnValue(raw) ? '（空值）' : String(raw),
        raw
      }
    }),
    'value'
  ).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN', { numeric: true }))
}

export function isColumnFilterActive(condition?: ColumnFilterCondition): boolean {
  return Boolean(
    condition &&
    (condition.empty ||
      condition.text?.trim() ||
      condition.values?.length ||
      (condition.start !== undefined && condition.start !== '') ||
      (condition.end !== undefined && condition.end !== ''))
  )
}

export function matchesColumnFilter(
  value: unknown,
  type: TableColumnFilterType,
  condition: ColumnFilterCondition
): boolean {
  const empty = isEmptyColumnValue(value)
  if (condition.empty === 'empty') return empty
  if (condition.empty === 'not-empty' && empty) return false
  if (type === 'text')
    return String(value ?? '')
      .toLocaleLowerCase()
      .includes((condition.text ?? '').trim().toLocaleLowerCase())
  if (type === 'select')
    return !condition.values?.length || condition.values.includes(columnFilterValueKey(value))
  if (type === 'none') return true
  const hasStart = condition.start !== undefined && condition.start !== ''
  const hasEnd = condition.end !== undefined && condition.end !== ''
  if (!hasStart && !hasEnd) return true
  if (empty) return false
  if (type === 'number-range') {
    if (typeof value !== 'string' && typeof value !== 'number') return false
    const numeric = Number(value)
    return (
      Number.isFinite(numeric) &&
      (!hasStart || numeric >= Number(condition.start)) &&
      (!hasEnd || numeric <= Number(condition.end))
    )
  }
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date))
    return false
  const time = dayjs(value).valueOf()
  const start = hasStart
    ? dayjs(condition.start)
        .startOf(type === 'date-range' ? 'day' : 'second')
        .valueOf()
    : -Infinity
  const end = hasEnd
    ? dayjs(condition.end)
        .endOf(type === 'date-range' ? 'day' : 'second')
        .valueOf()
    : Infinity
  return Number.isFinite(time) && time >= start && time <= end
}

export function filterColumnRows<T>(
  rows: T[],
  columns: ColumnOption<T>[],
  conditions: Record<string, ColumnFilterCondition>,
  childrenKey = 'children'
): T[] {
  const active = columns.filter(
    (column) =>
      column.prop &&
      column.filterType &&
      column.filterType !== 'none' &&
      column.visible !== false &&
      column.checked !== false &&
      isColumnFilterActive(conditions[column.prop])
  )
  if (!active.length) return rows
  return rows.flatMap((row) => {
    const children: unknown = get(row, childrenKey)
    const matched = active.every((column) =>
      matchesColumnFilter(get(row, column.prop!), column.filterType!, conditions[column.prop!])
    )
    if (!Array.isArray(children)) return matched ? [row] : []
    const filtered = filterColumnRows(children, columns, conditions, childrenKey)
    return matched || filtered.length ? [{ ...row, [childrenKey]: filtered }] : []
  })
}
