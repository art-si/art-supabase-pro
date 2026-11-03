import { get } from 'lodash-es'

/** Keep reference identities intact and omit missing parts of the `name · code` label. */
export function toNameCodeOption<TId extends string | number>(item: {
  id: TId
  name?: string | null
  code?: string | null
}): { label: string; value: TId } {
  return { label: [item.name, item.code].filter(Boolean).join(' · '), value: item.id }
}

/** Preserve dictionary values and use the dictionary name when its display label is empty. */
export function toDictionaryOption<TValue>(item: { label?: string; name: string; value: TValue }): {
  label: string
  value: TValue
} {
  return { label: getDictionaryDisplayLabel(item, item.value), value: item.value }
}

/** Unresolved dictionary values remain identifiable as incomplete data without exposing codes. */
export function getDictionaryDisplayLabel(
  item: { label?: string; name?: string } | undefined,
  value: unknown,
  options: { emptyText?: string; unknownText?: string } = {}
): string {
  const label = item?.label?.trim() || item?.name?.trim()
  if (label) return label
  if (value === undefined || value === null || value === '') return options.emptyText ?? '--'
  return options.unknownText ?? '待核对'
}

/**
 * Format a common business option as `name（code）`, falling back to the name.
 * Dynamic field access stays in this shared boundary instead of being cast in each page.
 */
export function formatNameCodeOption(option: object, nameKey: string, codeKey: string): string {
  const name = String(get(option, nameKey) ?? '')
  const code = String(get(option, codeKey) ?? '')
  return code ? `${name}（${code}）` : name
}
