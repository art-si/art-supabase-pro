/** Preserve the existing object boundary; arrays and null are never records. */
export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Narrow object-shaped protocol/error values without accepting arrays or null. */
export function toObjectRecord(value: unknown): Record<string, unknown> {
  return isObjectRecord(value) ? value : {}
}

/**
 * Read an exact own DTO data field without invoking accessors or Vue-reserved getters.
 * The HAS read tracks top-level changes on reactive records; returned objects stay raw
 * and this boundary does not provide nested reactivity or Ref unwrapping.
 */
export function getOwnRecordValue(record: object, key: string): unknown {
  Reflect.has(record, key)
  const descriptor = Object.getOwnPropertyDescriptor(record, key)
  return descriptor && 'value' in descriptor ? descriptor.value : undefined
}
