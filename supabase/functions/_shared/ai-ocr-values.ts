export function isOcrRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeOcrTextValue(value: unknown, maxLength = 500): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

export function normalizeOcrNonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const normalized = Number(value)
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null
}

export function normalizeOcrConfidence(value: unknown): number {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? Math.min(1, Math.max(0, normalized)) : 0
}

export function normalizeOcrStringArray(value: unknown, maxItems = 20): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => normalizeOcrTextValue(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems)
}

export function normalizeOcrDate(value: unknown): string | null {
  const source = normalizeOcrTextValue(value, 40)
  if (!source) return null
  const match = source.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/)
  if (!match) return null
  const normalized = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  const parsed = new Date(`${normalized}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized
    ? null
    : normalized
}

export function normalizeOcrDateTime(value: unknown): string | null {
  const source = normalizeOcrTextValue(value, 80)
  if (!source) return null
  const normalized = new Date(source)
  return Number.isNaN(normalized.getTime()) ? null : normalized.toISOString()
}
