import { formatWithDayjs, isValidDateTimeValue } from '@/utils/time'
import { toArray } from 'lodash-es'

/** Use one Unicode-safe avatar convention across operational surfaces. */
export function formatAvatarInitials(name?: string | null, emptyText = '?'): string {
  const source = name?.trim().split('@')[0] ?? ''
  const parts = source.split(/[\s._-]+/).filter(Boolean)
  const initials =
    parts.length > 1
      ? parts
          .slice(0, 2)
          .map((part) => toArray(part)[0])
          .join('')
      : toArray(source).slice(0, 2).join('')
  return initials.toUpperCase() || emptyText
}

export type ArtValueFormat = 'text' | 'number' | 'money' | 'date' | 'datetime' | 'boolean'

export interface ArtValueFormatOptions {
  numberFormat?: Intl.NumberFormatOptions
  currency?: string
  emptyText?: string
  locale?: string
  trueText?: string
  falseText?: string
}

export interface DateTimeValueFormatOptions {
  emptyText?: string
  format?: string
  invalidText?: string
  timezone?: string
  allowTimeOnly?: boolean
}

export interface PercentValueFormatOptions {
  numberFormat?: Intl.NumberFormatOptions
  emptyText?: string
  fractionDigits?: number
}

const isEmptyValue = (value: unknown): boolean =>
  value === undefined || value === null || value === ''
const currencyFormatters = new Map<string, Intl.NumberFormat>()
const numberFormatters = new Map<string, Intl.NumberFormat>()

/** Keep telemetry latency readable across AI, benchmark and chat surfaces. */
export function formatDurationMs(value?: number | null): string {
  if (value == null || !Number.isFinite(value) || value < 0) return '--'
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)} s`
  return `${Math.round(value)} ms`
}

export function formatNumberValue(
  value: unknown,
  locale = 'zh-CN',
  options?: Intl.NumberFormatOptions
): string {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return String(value)
  if (options && ![Object.prototype, null].includes(Object.getPrototypeOf(options))) {
    return new Intl.NumberFormat(locale, options).format(numberValue)
  }

  // Normalize option order so equivalent table-column configurations share a formatter.
  const formatterKey = JSON.stringify([
    locale,
    Object.fromEntries(
      Object.entries(options ?? {}).sort(([left], [right]) => left.localeCompare(right))
    )
  ])
  let formatter = numberFormatters.get(formatterKey)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options)
    // User-configurable precision/locales must not grow the application cache indefinitely.
    if (numberFormatters.size >= 64) numberFormatters.clear()
    numberFormatters.set(formatterKey, formatter)
  }
  return formatter.format(numberValue)
}

/** Format operational measurements with bounded precision and without trailing zeroes. */
export function formatCompactNumberValue(
  value: unknown,
  fractionDigits = 2,
  invalidText = '0'
): string {
  const numberValue = Number(value ?? 0)
  if (!Number.isFinite(numberValue)) return invalidText

  return numberValue
    .toFixed(fractionDigits)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '')
}

export function formatCurrencyValue(
  value: unknown,
  currency = 'CNY',
  locale = 'zh-CN',
  fractionDigits = 2
): string {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return String(value)

  const formatterKey = `${locale}\0${currency}\0${fractionDigits}`
  let formatter = currencyFormatters.get(formatterKey)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits
    })
    currencyFormatters.set(formatterKey, formatter)
  }

  return formatter.format(numberValue)
}

/** Format CNY values with the application-wide currency style; blank AI values mean zero. */
export function formatCnyCurrencyValue(value: unknown): string {
  return formatCurrencyValue(value ?? 0)
}

/** Preserve masked amounts while showing empty business values as unavailable. */
export function formatSensitiveCurrencyValue(
  value: unknown,
  currency = 'CNY',
  locale = 'zh-CN',
  fractionDigits = 2
): string {
  if (value === null || value === undefined || value === '') return '--'
  return formatCurrencyValue(value, currency, locale, fractionDigits)
}

/** Display currency codes while preserving protected amount text returned by the server. */
export function formatCurrencyCodeValue(
  value: number | string | null | undefined,
  currency = 'CNY'
): string {
  if (value == null) return '--'
  if (typeof value === 'string') return value
  return `${currency} ${formatNumberValue(value, 'zh-CN', { minimumFractionDigits: 2 })}`
}

/** Preserve server-provided count text and masks; format only numeric counts. */
export function formatSensitiveCountValue(value: number | string | null | undefined): string {
  if (isEmptyValue(value)) return '--'
  if (typeof value !== 'number') return String(value)
  return Number.isFinite(value) ? formatNumberValue(value) : value.toLocaleString('zh-CN')
}

export function formatPercentValue(
  value: unknown,
  options: PercentValueFormatOptions = {}
): string {
  const emptyText = options.emptyText ?? '--'
  if (isEmptyValue(value)) return emptyText
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return String(value)
  if (options.numberFormat) {
    return `${formatNumberValue(numberValue, 'zh-CN', options.numberFormat)}%`
  }
  return `${numberValue.toFixed(options.fractionDigits ?? 1)}%`
}

export function formatDateTimeValue(
  value: string | Date | null | undefined,
  options: DateTimeValueFormatOptions = {}
): string {
  const emptyText = options.emptyText ?? '--'
  if (value == null || value === '') return emptyText
  if (options.invalidText !== undefined && !isValidDateTimeValue(value, options.allowTimeOnly)) {
    return options.invalidText
  }
  return (
    formatWithDayjs(value, options.format ?? 'YYYY-MM-DD HH:mm:ss', options.timezone) ?? emptyText
  )
}

/** Create a view formatter while keeping date parsing and invalid-value policy centralized. */
export function createDateTimeFormatter(options: DateTimeValueFormatOptions = {}) {
  return (value: string | Date | null | undefined): string => formatDateTimeValue(value, options)
}

export function formatArtValue(
  value: unknown,
  format: ArtValueFormat = 'text',
  options: ArtValueFormatOptions = {}
): string {
  const emptyText = options.emptyText ?? '--'
  if (isEmptyValue(value)) return emptyText

  switch (format) {
    case 'number':
      return formatNumberValue(value, options.locale, options.numberFormat)
    case 'money':
      return formatCurrencyValue(value, options.currency, options.locale)
    case 'date':
      return formatWithDayjs(String(value), 'YYYY-MM-DD') ?? emptyText
    case 'datetime':
      return formatWithDayjs(String(value), 'YYYY-MM-DD HH:mm:ss') ?? emptyText
    case 'boolean':
      return value ? (options.trueText ?? '是') : (options.falseText ?? '否')
    default:
      return String(value)
  }
}
