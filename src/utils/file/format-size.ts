export interface FileSizeFormatOptions {
  precision?: number
  emptyText?: string
  trimZeros?: boolean
}

/** Format non-negative byte counts with consistent binary unit boundaries. */
export function formatSize(
  size?: number | null,
  { precision = 2, emptyText = '—', trimZeros = false }: FileSizeFormatOptions = {}
): string {
  if (size == null || !Number.isFinite(size) || size < 0) return emptyText
  const digits = Number.isFinite(precision) ? Math.min(20, Math.max(0, Math.trunc(precision))) : 2
  const units = ['B', 'KB', 'MB', 'GB'] as const
  let value = size
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const text = unit === 0 ? String(value) : value.toFixed(digits)
  return `${trimZeros ? Number(text) : text} ${units[unit]}`
}
