import { mapKeys, mapValues } from 'lodash-es'
import { isPlainObjectRecord } from '../type-guards'

const toCamel = (key: string): string =>
  key.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())
const toSnake = (key: string): string =>
  key
    .replace(/([A-Z])/g, '_$1')
    .replace(/^_/, '')
    .toLowerCase()

// TypeScript cannot derive renamed keys. Keep the DTO assertion at this serialization boundary.
const asKeyTransformResult = <T>(value: unknown): T => value as T

export function keysToCamelDeep<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) return asKeyTransformResult<T>(value.map(keysToCamelDeep))
  if (!isPlainObjectRecord(value)) return asKeyTransformResult<T>(value)
  return asKeyTransformResult<T>(
    mapKeys(mapValues(value, keysToCamelDeep), (_, key) => toCamel(key))
  )
}

export function keysToCamelShallow<T = unknown>(value: unknown): T {
  if (!isPlainObjectRecord(value)) return asKeyTransformResult<T>(value)
  return asKeyTransformResult<T>(mapKeys(value, (_, key) => toCamel(key)))
}

export function keysToSnakeDeep<T>(value: T): T {
  if (Array.isArray(value)) return asKeyTransformResult<T>(value.map(keysToSnakeDeep))
  if (!isPlainObjectRecord(value)) return value
  return asKeyTransformResult<T>(
    mapKeys(mapValues(value, keysToSnakeDeep), (_, key) => toSnake(key))
  )
}
