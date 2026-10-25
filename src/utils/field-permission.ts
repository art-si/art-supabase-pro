import { omit } from 'lodash-es'
import { formatNumberValue } from '@/utils/ui/format'

export type FieldAccessLevel = 'hidden' | 'masked' | 'read' | 'edit'

export type FieldAccessMap<TKey extends string = string> = Partial<Record<TKey, FieldAccessLevel>>

/** Masked values may be displayed, but only read/edit grants expose usable source data. */
export const isReadableFieldAccess = (access: unknown): access is 'read' | 'edit' =>
  access === 'read' || access === 'edit'

const MASK_PLACEHOLDER = '***'
const FIELD_ACCESS_RANK: Record<FieldAccessLevel, number> = {
  hidden: 0,
  masked: 1,
  read: 2,
  edit: 3
}

const isFieldAccessLevel = (value: unknown): value is FieldAccessLevel =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(FIELD_ACCESS_RANK, value)

export const mergeFieldAccessMaps = <TKey extends string>(
  ...maps: Array<FieldAccessMap<TKey> | null | undefined>
): FieldAccessMap<TKey> => {
  const levels = new Map<string, FieldAccessLevel>()
  maps.forEach((access) => {
    if (!access) return
    Object.entries(access).forEach(([key, level]) => {
      if (!isFieldAccessLevel(level)) return
      const current = levels.get(key)
      if (!current || FIELD_ACCESS_RANK[level] > FIELD_ACCESS_RANK[current]) {
        levels.set(key, level)
      }
    })
  })
  // Object.fromEntries loses the generic key set; keys originate from the supplied maps.
  return Object.fromEntries(levels) as FieldAccessMap<TKey>
}

export const getFieldAccess = <TKey extends string>(
  access: FieldAccessMap<TKey> | null | undefined,
  field: TKey,
  fallback: FieldAccessLevel = 'hidden'
): FieldAccessLevel => {
  if (!access || !Object.prototype.hasOwnProperty.call(access, field)) return fallback
  const level = access[field]
  return isFieldAccessLevel(level) ? level : fallback
}

export const canViewField = <TKey extends string>(
  access: FieldAccessMap<TKey> | null | undefined,
  field: TKey,
  fallback: FieldAccessLevel = 'hidden'
): boolean => getFieldAccess(access, field, fallback) !== 'hidden'

export const canEditField = <TKey extends string>(
  access: FieldAccessMap<TKey> | null | undefined,
  field: TKey,
  fallback: FieldAccessLevel = 'hidden'
): boolean => getFieldAccess(access, field, fallback) === 'edit'

export const isMaskedValue = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() === MASK_PLACEHOLDER

/** Only readable finite values may participate in aggregates; masked values stay unavailable. */
export const parseReadableSensitiveNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string' || !value.trim() || value.includes('*')) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const formatSensitiveNumber = (
  value: number | string | null | undefined,
  options: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 }
): string => {
  if (value === null || value === undefined) return '--'
  if (typeof value === 'string') {
    if (!value.trim()) return '--'
    if (isMaskedValue(value)) return MASK_PLACEHOLDER
  }
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return '--'
  return formatNumberValue(numericValue, 'zh-CN', options)
}

export interface SensitiveNumberAffixOptions {
  emptyText?: string
  prefix?: string
  suffix?: string
  numberFormat?: Intl.NumberFormatOptions
}

/** 给可脱敏数值追加币种或单位；空值和掩码保持原样，避免显示成“¥***”或“-- 元”。 */
export const formatSensitiveNumberWithAffix = (
  value: number | string | null | undefined,
  options: SensitiveNumberAffixOptions = {}
): string => {
  const formatted = formatSensitiveNumber(value, options.numberFormat)
  if (formatted === MASK_PLACEHOLDER) return formatted
  if (formatted === '--') return options.emptyText ?? formatted
  return `${options.prefix ?? ''}${formatted}${options.suffix ?? ''}`
}

export const omitNonEditableFields = <
  TRecord extends Record<string, unknown>,
  TKey extends Extract<keyof TRecord, string>
>(
  record: TRecord,
  access: FieldAccessMap<TKey> | null | undefined,
  fields: readonly TKey[],
  fallback: FieldAccessLevel = 'hidden'
): TRecord => {
  const result = { ...record }
  fields.forEach((field) => {
    if (!canEditField(access, field, fallback)) delete result[field]
  })
  return result
}

const WRITE_METADATA_FIELDS = [
  'tenantId',
  'createBy',
  'createTime',
  'updateBy',
  'updateTime',
  'fieldAccess',
  'isRecordOwner'
] as const

/** Remove fields owned by the server or read model before a business payload is persisted. */
export function omitWriteMetadata<TRecord extends object>(
  record: TRecord,
  extraFields: readonly string[] = []
): TRecord {
  return omit(record, [...WRITE_METADATA_FIELDS, ...extraFields]) as TRecord
}

/** Remove payload fields whose owning field-access group is not editable. */
export function omitNonEditableFieldGroups<TRecord extends object, TField extends string>(
  record: TRecord,
  access: FieldAccessMap<TField> | null | undefined,
  fieldGroups: Partial<Record<TField, readonly string[]>>
): TRecord {
  const restrictedKeys = (
    Object.entries(fieldGroups) as Array<[TField, readonly string[]]>
  ).flatMap(([field, keys]) => (canEditField(access, field) ? [] : keys))
  return omit(record, restrictedKeys) as TRecord
}
