import Decimal from 'decimal.js-light'
import { orderBy } from 'lodash-es'
import { getOwnRecordValue } from '@/utils/record'

export interface SqlResultProfileColumn {
  name: string
  property?: string
  type?: string | null
  fullType?: string | null
}

export type SqlResultProfileValueKind = 'string' | 'number' | 'bigint' | 'boolean'

export interface SqlResultProfileTopValue {
  label: string
  kind: SqlResultProfileValueKind
  /** First occurrence in the original rows, for an on-demand full-value viewer. */
  sourceRowIndex: number
  count: number
  /** Denominator is all original loaded rows, including NULL and excluded values. */
  ratio: number
  truncated: boolean
}

export interface SqlResultNumericProfile {
  count: number
  unsafeNumberCount: number
  nonFiniteCount: number
  invalidCount: number
  limitedCount: number
  min: string | null
  max: string | null
  sum: string | null
  average: string | null
  averageApproximate: boolean
}

export interface SqlResultTextProfile {
  count: number
  limitedCount: number
  minLength: number | null
  maxLength: number | null
  averageLength: string | null
  averageApproximate: boolean
}

export interface SqlResultProfile {
  field: string
  totalRows: number
  nonNullCount: number
  /** NULL includes missing/undefined properties; undefinedCount identifies that subset. */
  nullCount: number
  undefinedCount: number
  emptyStringCount: number
  /** Nonempty strings containing only ECMAScript whitespace. */
  whitespaceCount: number
  whitespaceExcludedCount: number
  classifiedCount: number
  /** Distinct non-NULL scalar values, including empty strings; type is part of identity. */
  distinctCount: number
  duplicateCount: number
  distinctExcludedCount: number
  topValuesComplete: boolean
  topValues: SqlResultProfileTopValue[]
  numeric?: SqlResultNumericProfile
  text: SqlResultTextProfile
  categories: { objectCount: number; arrayCount: number; unsupportedCount: number }
  limits: string[]
}

export interface SqlResultProfileOptions {
  signal?: AbortSignal
  /** UI callers may yield to a frame/task; no DOM, timer, or persistent state is owned here. */
  yieldControl?: () => Promise<void>
}

const numericType =
  /^(?:smallint|integer|int\d*|bigint|tinyint|mediumint|decimal|numeric|number|float\d*|double(?:\s+precision)?|real|dec|binary_float|binary_double)(?:\s*\([^)]*\))?(?:\s+unsigned)?$/i
const numericLiteral = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
const maxNumericCharacters = 1024
const maxNumericExponent = 1024
const maxValueCharacters = 65_536
const maxIdentityCharacters = 2_097_152
const maxDistinctValues = 10_000
const maxTextValueCharacters = 1_048_576
const maxTextCharacters = 8_388_608
const maxLabelCodePoints = 160
const yieldInterval = 256
const bigintIdentityLimit = 10n ** BigInt(maxValueCharacters)
const bigintNumericLimit = 10n ** BigInt(maxNumericCharacters)

interface ValueFrequency {
  value: string | number | bigint | boolean
  kind: SqlResultProfileValueKind
  count: number
  firstIndex: number
}

/** Whether sum/count terminates in base ten, without rounding the quotient to decide. */
function terminatingAverage(sum: Decimal, count: number): boolean {
  let numerator = BigInt(sum.toFixed().replace('.', ''))
  if (numerator < 0n) numerator = -numerator
  let denominator = BigInt(count)
  let remainder = denominator
  while (remainder) {
    const next = numerator % remainder
    numerator = remainder
    remainder = next
  }
  denominator /= numerator
  while (denominator % 2n === 0n) denominator /= 2n
  while (denominator % 5n === 0n) denominator /= 5n
  return denominator === 1n
}

function average(sum: Decimal, count: number): { value: string; approximate: boolean } {
  const approximate = !terminatingAverage(sum, count)
  const quotient = sum.dividedBy(count)
  return {
    value: (approximate ? quotient.toSignificantDigits(24) : quotient).toString(),
    approximate
  }
}

function valueLabel(entry: ValueFrequency): Pick<SqlResultProfileTopValue, 'label' | 'truncated'> {
  // A bounded preview preserves whitespace and quotes without serializing user objects.
  const raw = String(entry.value)
  let preview = ''
  let count = 0
  for (const character of raw) {
    if (count === maxLabelCodePoints) break
    preview += character
    count++
  }
  const truncated = preview.length < raw.length
  const label = entry.kind === 'string' ? JSON.stringify(preview) : preview
  return { label: `${label}${truncated ? '…' : ''}`, truncated }
}

/**
 * Profile exactly one column in all original loaded rows. No filtering, editable copy,
 * column-wide discovery, persistence, or object traversal occurs. Bounded exclusions are
 * explicit, so an incomplete distinct/length/numeric result is never advertised as complete.
 */
export async function buildSqlResultProfile(
  rows: readonly Record<string, unknown>[],
  column: SqlResultProfileColumn,
  options: SqlResultProfileOptions = {}
): Promise<SqlResultProfile> {
  options.signal?.throwIfAborted()
  const result: SqlResultProfile = {
    field: column.name,
    totalRows: rows.length,
    nonNullCount: 0,
    nullCount: 0,
    undefinedCount: 0,
    emptyStringCount: 0,
    whitespaceCount: 0,
    whitespaceExcludedCount: 0,
    classifiedCount: 0,
    distinctCount: 0,
    duplicateCount: 0,
    distinctExcludedCount: 0,
    topValuesComplete: true,
    topValues: [],
    text: {
      count: 0,
      limitedCount: 0,
      minLength: null,
      maxLength: null,
      averageLength: null,
      averageApproximate: false
    },
    categories: { objectCount: 0, arrayCount: 0, unsupportedCount: 0 },
    limits: []
  }
  const isNumeric = numericType.test((column.fullType || column.type || '').trim())
  if (isNumeric) {
    result.numeric = {
      count: 0,
      unsafeNumberCount: 0,
      nonFiniteCount: 0,
      invalidCount: 0,
      limitedCount: 0,
      min: null,
      max: null,
      sum: null,
      average: null,
      averageApproximate: false
    }
  }
  // Accepted values have exponent <=1024 and scale <=1024. This precision covers
  // their entire 2049-digit span, all row-count carry digits, and terminating division.
  const rowDigits = Math.max(1, rows.length)
  const ProfileDecimal = Decimal.clone({
    precision: 2052 + Math.ceil(Math.log10(rowDigits)) + Math.ceil(Math.log2(rowDigits))
  })
  let sum = new ProfileDecimal(0)
  let min: Decimal | undefined
  let max: Decimal | undefined
  let textCharacters = 0
  let textLengthSum = 0
  let identityCharacters = 0
  let numberRepresentations = 0
  const frequencies = new Map<string, ValueFrequency>()
  const property = column.property ?? column.name

  for (let index = 0; index < rows.length; index++) {
    if (index && index % yieldInterval === 0) {
      if (options.yieldControl) await options.yieldControl()
      options.signal?.throwIfAborted()
    }
    const row = rows[index]
    const value = getOwnRecordValue(row, property)
    if (value == null) {
      result.nullCount++
      if (value === undefined) result.undefinedCount++
      continue
    }
    result.nonNullCount++
    if (typeof value === 'string') {
      if (value === '') result.emptyStringCount++
      if (
        value.length > maxTextValueCharacters ||
        textCharacters + value.length > maxTextCharacters
      ) {
        result.text.limitedCount++
        result.whitespaceExcludedCount++
      } else {
        textCharacters += value.length
        let length = 0
        const characters = value[Symbol.iterator]()
        while (!characters.next().done) length++
        result.text.count++
        textLengthSum += length
        result.text.minLength = Math.min(result.text.minLength ?? length, length)
        result.text.maxLength = Math.max(result.text.maxLength ?? length, length)
        if (value !== '' && /^\s+$/u.test(value)) result.whitespaceCount++
      }
    }

    if (typeof value === 'object') {
      if (Array.isArray(value)) result.categories.arrayCount++
      else result.categories.objectCount++
      result.distinctExcludedCount++
    } else if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'bigint' &&
      typeof value !== 'boolean'
    ) {
      result.categories.unsupportedCount++
      result.distinctExcludedCount++
    } else {
      const tooLargeBigint =
        typeof value === 'bigint' && (value >= bigintIdentityLimit || value <= -bigintIdentityLimit)
      const raw = tooLargeBigint ? '' : String(value)
      if (tooLargeBigint || raw.length > maxValueCharacters) result.distinctExcludedCount++
      else {
        const kind: SqlResultProfileValueKind =
          typeof value === 'string'
            ? 'string'
            : typeof value === 'number'
              ? 'number'
              : typeof value === 'bigint'
                ? 'bigint'
                : 'boolean'
        const key = `${kind}:${raw}`
        const entry = frequencies.get(key)
        if (entry) {
          entry.count++
          result.classifiedCount++
        } else if (
          frequencies.size >= maxDistinctValues ||
          identityCharacters + key.length > maxIdentityCharacters
        ) {
          result.distinctExcludedCount++
        } else {
          identityCharacters += key.length
          frequencies.set(key, { value, kind, count: 1, firstIndex: index })
          result.classifiedCount++
        }
      }
    }

    const numeric = result.numeric
    if (!numeric) continue
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        numeric.nonFiniteCount++
        continue
      }
      if (Math.abs(value) > Number.MAX_SAFE_INTEGER) {
        numeric.unsafeNumberCount++
        continue
      }
      numberRepresentations++
    } else if (typeof value !== 'string' && typeof value !== 'bigint') {
      numeric.invalidCount++
      continue
    }
    if (
      typeof value === 'bigint' &&
      (value >= bigintNumericLimit || value <= -bigintNumericLimit)
    ) {
      numeric.limitedCount++
      continue
    }
    const raw = String(value)
    if (raw.length > maxNumericCharacters) {
      numeric.limitedCount++
      continue
    }
    const normalized = raw.trim()
    if (/^[+-]?(?:nan|inf(?:inity)?)$/i.test(normalized)) {
      numeric.nonFiniteCount++
      continue
    }
    if (!numericLiteral.test(normalized)) {
      numeric.invalidCount++
      continue
    }
    const writtenExponent = Number(/[eE]([+-]?\d+)$/.exec(normalized)?.[1] ?? 0)
    if (Math.abs(writtenExponent) > maxNumericExponent + maxNumericCharacters) {
      numeric.limitedCount++
      continue
    }
    // Inspect effective exponent, not the textual e suffix: a long coefficient also
    // changes the order of magnitude. Constructor parsing never rounds the input.
    const decimal = new ProfileDecimal(normalized)
    if (
      Math.abs(decimal.exponent()) > maxNumericExponent ||
      decimal.decimalPlaces() > maxNumericExponent
    ) {
      numeric.limitedCount++
      continue
    }
    numeric.count++
    sum = sum.plus(decimal)
    if (!min || decimal.lt(min)) min = decimal
    if (!max || decimal.gt(max)) max = decimal
  }
  options.signal?.throwIfAborted()
  result.distinctCount = frequencies.size
  result.duplicateCount = result.classifiedCount - result.distinctCount
  result.topValuesComplete = result.distinctExcludedCount === 0
  result.topValues = orderBy([...frequencies.values()], ['count', 'firstIndex'], ['desc', 'asc'])
    .slice(0, 10)
    .map((entry) => ({
      ...valueLabel(entry),
      kind: entry.kind,
      sourceRowIndex: entry.firstIndex,
      count: entry.count,
      ratio: entry.count / result.totalRows
    }))
  if (result.numeric?.count) {
    const mean = average(sum, result.numeric.count)
    result.numeric.min = min?.toString() ?? null
    result.numeric.max = max?.toString() ?? null
    result.numeric.sum = sum.toString()
    result.numeric.average = mean.value
    result.numeric.averageApproximate = mean.approximate
  }
  if (result.text.count) {
    const mean = average(new ProfileDecimal(textLengthSum), result.text.count)
    result.text.averageLength = mean.value
    result.text.averageApproximate = mean.approximate
  }
  if (result.distinctExcludedCount)
    result.limits.push('对象、数组、特殊类型及超出归类边界的值未参与不同值、重复和常见值统计')
  if (result.text.limitedCount)
    result.limits.push('超长文本或累计超过 8 Mi 字符的文本未参与字符长度和纯空白判断')
  if (result.numeric?.limitedCount)
    result.limits.push(
      '超过 1024 字符、有效指数绝对值或小数位超过 1024 等安全边界的值未参与数值统计'
    )
  if (result.numeric?.unsafeNumberCount)
    result.limits.push(
      '超过 JavaScript 安全整数范围的数值已排除；请在 SQL 中转换为文本以保留原始精度'
    )
  if (numberRepresentations)
    result.limits.push('JavaScript 数值按当前可见十进制表示计算，无法恢复传输前已丢失的精度')
  return result
}
