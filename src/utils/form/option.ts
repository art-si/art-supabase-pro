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
  return { label: item.label || item.name, value: item.value }
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
