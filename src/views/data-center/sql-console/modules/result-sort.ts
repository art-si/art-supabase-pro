import Decimal from 'decimal.js-light'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import utc from 'dayjs/plugin/utc'
import { getOwnRecordValue } from '@/utils/record'
import { getSqlCellEditorKind } from './result-edit'

export type SqlResultSortDirection = 'ascending' | 'descending'
export type SqlResultSortKind =
  'number' | 'text' | 'boolean' | 'date' | 'datetime' | 'time' | 'unsupported'

export interface SqlResultSortColumn {
  name: string
  property?: string
  type?: string | null
  fullType?: string | null
}

export interface SqlResultSortResult {
  rows: Record<string, unknown>[]
  kind: SqlResultSortKind
  /** SQL NULL, own undefined and missing fields share the unsorted tail. */
  nullCount: number
  /** Non-NULL values whose type, precision or time semantics cannot be compared reliably. */
  excludedCount: number
  message?: string
}

type SortKey =
  | { kind: 'number'; value: Decimal }
  | { kind: 'text'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'temporal'; value: bigint; aware: boolean }

interface SortEntry {
  row: Record<string, unknown>
  index: number
  key?: SortKey
}

dayjs.extend(customParseFormat)
dayjs.extend(utc)

const maxNumericCharacters = 4096
const maxTextCharacters = 1_048_576
const bigintLimit = 10n ** BigInt(maxNumericCharacters)
const numericLiteral = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
const unsupportedType =
  /(?:\[\]|\b(?:array|jsonb?|blob|clob|bytea|binary|varbinary|geometry|geography|xml|image|raw|interval|record|object)\b)/i
const isoDate = /^\d{4}-\d{2}-\d{2}$/
const isoTime = /^(\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2})(?::?(\d{2}))?)?$/
const textCollator = new Intl.Collator('zh-CN', { numeric: false, sensitivity: 'variant' })

export function getSqlResultSortKind(column: SqlResultSortColumn): SqlResultSortKind {
  const dataType = (column.fullType || column.type || '').trim()
  if (unsupportedType.test(dataType)) return 'unsupported'
  if (/^bit(?:\s*\(\s*1\s*\))?$/i.test(dataType)) return 'number'
  if (/^bit\b/i.test(dataType)) return 'unsupported'
  if (/^timestamptz\b/i.test(dataType)) return 'datetime'
  if (/^timetz\b/i.test(dataType)) return 'time'
  const kind = getSqlCellEditorKind({ name: column.name, dataType, isNullable: true })
  return kind === 'json' ? 'unsupported' : kind === 'enum' ? 'text' : kind
}

function numericSortKey(value: unknown): SortKey | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
      return undefined
  } else if (typeof value === 'bigint') {
    if (value >= bigintLimit || value <= -bigintLimit) return undefined
  } else if (typeof value !== 'string') return undefined
  if (typeof value === 'string' && value.length > maxNumericCharacters) return undefined
  const raw = String(value).trim()
  if (!raw || raw.length > maxNumericCharacters || !numericLiteral.test(raw)) return undefined
  try {
    // Constructors and cmp retain all input digits; arithmetic precision is not involved.
    return { kind: 'number', value: new Decimal(raw) }
  } catch {
    return undefined
  }
}

function temporalSortKey(value: unknown, kind: 'date' | 'datetime' | 'time'): SortKey | undefined {
  if (typeof value !== 'string' || value.length > 48) return undefined
  const date = kind === 'time' ? '2000-01-01' : kind === 'date' ? value : value.slice(0, 10)
  if (!isoDate.test(date) || (kind === 'datetime' && !/[T ]/.test(value[10] || '')))
    return undefined
  const time = kind === 'date' ? '00:00:00' : kind === 'time' ? value : value.slice(11)
  const parts = time.match(isoTime)
  if (!parts) return undefined
  const civil = dayjs.utc(`${date} ${parts[1]}`, 'YYYY-MM-DD HH:mm:ss', true)
  // Day.js strict validation excludes years 0000–0099, leap seconds and 24:00.
  if (!civil.isValid()) return undefined
  const zone = parts[3]
  const hours = Number(parts[5] || 0)
  const minutes = Number(parts[6] || 0)
  if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return undefined
  // RFC 3339 -00:00 denotes an unknown offset, so it cannot establish an instant.
  if (parts[4] === '-' && hours === 0 && minutes === 0) return undefined
  const offsetMinutes = (hours * 60 + minutes) * (parts[4] === '-' ? -1 : 1)
  const fraction = BigInt((parts[2] || '').padEnd(9, '0'))
  return {
    kind: 'temporal',
    value:
      BigInt(civil.valueOf()) * 1_000_000n + fraction - BigInt(offsetMinutes) * 60_000_000_000n,
    aware: Boolean(zone)
  }
}

function sortKey(value: unknown, kind: SqlResultSortKind): SortKey | undefined {
  if (kind === 'number') return numericSortKey(value)
  if (kind === 'text')
    return typeof value === 'string' && value.length <= maxTextCharacters
      ? { kind, value }
      : undefined
  if (kind === 'boolean') return typeof value === 'boolean' ? { kind, value } : undefined
  if (kind === 'date' || kind === 'datetime' || kind === 'time') return temporalSortKey(value, kind)
  return undefined
}

function compareKeys(a: SortKey, b: SortKey): number {
  if (a.kind === 'number' && b.kind === 'number') return a.value.cmp(b.value)
  if (a.kind === 'text' && b.kind === 'text') return textCollator.compare(a.value, b.value)
  if (a.kind === 'boolean' && b.kind === 'boolean')
    return a.value === b.value ? 0 : a.value ? 1 : -1
  if (a.kind === 'temporal' && b.kind === 'temporal')
    return a.value === b.value ? 0 : a.value < b.value ? -1 : 1
  return 0
}

/** A single selected field is parsed once per loaded row; source rows and values stay untouched. */
export function sortSqlResultRows(
  rows: readonly Record<string, unknown>[],
  column: SqlResultSortColumn,
  direction: SqlResultSortDirection
): SqlResultSortResult {
  const kind = getSqlResultSortKind(column)
  const property = column.property ?? column.name
  let nullCount = 0
  let excludedCount = 0
  let hasAware = false
  let hasNaive = false
  const entries: SortEntry[] = rows.map((row, index) => {
    const value = getOwnRecordValue(row, property)
    if (value == null) {
      nullCount++
      return { row, index }
    }
    const key = sortKey(value, kind)
    if (!key) excludedCount++
    if (key?.kind === 'temporal') {
      hasAware ||= key.aware
      hasNaive ||= !key.aware
    }
    return { row, index, key }
  })
  const mixedTime = hasAware && hasNaive
  if (mixedTime)
    for (const entry of entries)
      if (entry.key?.kind === 'temporal') {
        entry.key = undefined
        excludedCount++
      }
  const result: SqlResultSortResult = {
    rows: entries
      .toSorted((a, b) => {
        if (!a.key || !b.key) return a.key ? -1 : b.key ? 1 : a.index - b.index
        const compared =
          direction === 'ascending' ? compareKeys(a.key, b.key) : compareKeys(b.key, a.key)
        return compared || a.index - b.index
      })
      .map(({ row }) => row),
    kind,
    nullCount,
    excludedCount
  }
  if (kind === 'unsupported') result.message = '此字段类型暂不支持本地排序，结果保持查询顺序。'
  else if (mixedTime)
    result.message = '字段混合了带时区与不带时区的时间，无法确定统一时间语义，已保留查询顺序。'
  else {
    const notes: string[] = []
    if (excludedCount) notes.push(`${excludedCount} 个值无法可靠比较，已保留相对顺序并置后。`)
    if (excludedCount && (kind === 'date' || kind === 'datetime' || kind === 'time'))
      notes.push('时间排序支持公元 0100–9999 年 ISO 格式、最多 9 位小数秒及 ±14:00 内的明确偏移。')
    if (kind === 'time' && hasAware)
      notes.push('带偏移的时间按同一参考日折算后比较，不推断日期或跨日循环。')
    if (notes.length) result.message = notes.join('')
  }
  return result
}
