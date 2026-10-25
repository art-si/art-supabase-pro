import { includes } from 'lodash-es'

/** Import templates default to enabled unless an explicit disabled value is supplied. */
export function normalizeImportedEnabled(value: unknown): boolean {
  return !includes([false, 'false', '停用', '否'], value)
}

/**
 * Normalize text for a database column that does not accept NULL.
 * Blank form values remain an empty string so an explicit payload cannot bypass the column default.
 */
export function normalizeNonNullableText(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

/** Normalize text for a database column where blank input means NULL. */
export function normalizeNullableText(value: string | null | undefined): string | null {
  return normalizeNonNullableText(value) || null
}

/** Normalize a form value into a finite number, using NULL for blank or invalid input. */
export function normalizeNullableNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !value.trim()) return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

/** Normalize one or many select keys into the string array used by multi-select models. */
export function normalizeStringList(value: unknown | readonly unknown[]): string[] {
  return (Array.isArray(value) ? value : value == null ? [] : [value]).map(String)
}

/** Single-select models use the first key and represent a cleared selection as undefined. */
export function normalizeSingleStringKey(
  value: string | number | readonly (string | number)[] | null | undefined
): string | undefined {
  const selectedValue = Array.isArray(value) ? value[0] : value
  return selectedValue == null ? undefined : String(selectedValue)
}
