import { getOwnRecordValue } from '@/utils/record'

export type SqlResultFilterValue = null | string | boolean | bigint | number

export interface SqlResultValueFilter {
  id: string
  field: string
  operator: 'include' | 'exclude'
  value: SqlResultFilterValue
}

const maxSummaryLength = 160

/** Validate a selected cell without coercing values, invoking getters, or reading inherited fields. */
export function readSqlResultFilterValue(
  row: object,
  field: string
): { supported: true; value: SqlResultFilterValue } | { supported: false; reason: string } {
  const value = getOwnRecordValue(row, field)
  if (value === undefined) {
    const descriptor = Object.getOwnPropertyDescriptor(row, field)
    return {
      supported: false,
      reason: !descriptor
        ? '该行缺少此字段'
        : !('value' in descriptor)
          ? '访问器字段不支持筛选'
          : 'undefined 值不支持筛选'
    }
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return { supported: true, value }
  if (typeof value === 'bigint') return { supported: true, value }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { supported: false, reason: '非有限值（NaN/Infinity）' }
    if (Number.isInteger(value) && !Number.isSafeInteger(value))
      return { supported: false, reason: '整数超出安全精度' }
    return { supported: true, value }
  }
  return {
    supported: false,
    reason:
      typeof value === 'object'
        ? Array.isArray(value)
          ? '数组等复杂值不支持筛选'
          : 'JSON 对象等复杂值不支持筛选'
        : typeof value === 'function'
          ? '函数值不支持筛选'
          : 'Symbol 值不支持筛选'
  }
}

/**
 * Apply all conditions to loaded raw values using Object.is, including type and signed zero.
 * Exclusion keeps missing/undefined fields when the selected value differs, including NULL.
 * Returns a new array even without conditions; row references, values, and order stay unchanged.
 */
export function filterSqlResultValueRows<T extends object>(
  rows: readonly T[],
  filters: readonly SqlResultValueFilter[]
): T[] {
  return rows.filter((row) =>
    filters.every((filter) => {
      const equal = Object.is(getOwnRecordValue(row, filter.field), filter.value)
      return filter.operator === 'include' ? equal : !equal
    })
  )
}

/** Condition identity deliberately ignores the UI chip id. */
export function areSqlResultValueFiltersEqual(
  a: SqlResultValueFilter,
  b: SqlResultValueFilter
): boolean {
  return a.field === b.field && a.operator === b.operator && Object.is(a.value, b.value)
}

/** Bounded JSON string summary: never scan or serialize the full potentially large value. */
function formatStringSummary(value: string): string {
  let end = Math.min(value.length, maxSummaryLength - 2)
  if (end < value.length && (value.codePointAt(end - 1) ?? 0) > 0xffff) end--
  const bounded = value.slice(0, end)
  let preview = ''
  let consumed = 0
  let length = 2 // Opening and closing JSON quotes.
  for (const character of bounded) {
    const escaped = JSON.stringify(character).slice(1, -1)
    const nextConsumed = consumed + character.length
    const ellipsisLength = nextConsumed < value.length ? 1 : 0
    if (length + escaped.length + ellipsisLength > maxSummaryLength) break
    preview += escaped
    consumed = nextConsumed
    length += escaped.length
  }
  return `"${preview}"${consumed < value.length ? '…' : ''}`
}

/** Display only; every condition retains its complete original value for matching. */
export function formatSqlResultFilterValue(value: SqlResultFilterValue): string {
  if (typeof value === 'string') return formatStringSummary(value)
  if (value === null) return 'NULL'
  if (Object.is(value, -0)) return '-0'
  const raw = String(value)
  const suffix = typeof value === 'bigint' ? 'n' : ''
  const budget = maxSummaryLength - suffix.length
  return `${raw.length <= budget ? raw : `${raw.slice(0, budget - 1)}…`}${suffix}`
}
