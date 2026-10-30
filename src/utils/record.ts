/** Preserve the existing object boundary; arrays and null are never records. */
export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Narrow object-shaped protocol/error values without accepting arrays or null. */
export function toObjectRecord(value: unknown): Record<string, unknown> {
  return isObjectRecord(value) ? value : {}
}
