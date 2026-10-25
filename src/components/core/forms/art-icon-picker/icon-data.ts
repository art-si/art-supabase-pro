import { escapeRegExp, uniq } from 'lodash-es'
import { isPlainObjectRecord } from '@/utils/type-guards'

const iconNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function normalizeIconNames(names: unknown[], prefix: string): string[] {
  if (!iconNamePattern.test(prefix)) return []
  return uniq(
    names.filter((name): name is string => typeof name === 'string' && iconNamePattern.test(name))
  )
    .sort((left, right) => left.localeCompare(right))
    .map((name) => `${prefix}:${name}`)
}

export function parseIconCollectionNames(collection: unknown, prefix: string): string[] {
  if (!isPlainObjectRecord(collection)) return []
  if (collection.prefix !== undefined && collection.prefix !== prefix) return []
  return normalizeIconNames(
    [
      ...(Array.isArray(collection.uncategorized) ? collection.uncategorized : []),
      ...(isPlainObjectRecord(collection.categories)
        ? Object.values(collection.categories).flatMap((icons: unknown) =>
            Array.isArray(icons) ? icons : []
          )
        : []),
      ...(isPlainObjectRecord(collection.aliases) ? Object.keys(collection.aliases) : [])
    ],
    prefix
  )
}

export function parseIconCache(value: unknown, prefix: string, now: number): string[] | undefined {
  if (!iconNamePattern.test(prefix)) return
  if (
    !isPlainObjectRecord(value) ||
    typeof value.expiresAt !== 'number' ||
    !Number.isFinite(value.expiresAt) ||
    value.expiresAt <= now ||
    !Array.isArray(value.icons) ||
    !value.icons.length
  )
    return
  const pattern = new RegExp(`^${escapeRegExp(prefix)}:[a-z0-9]+(?:-[a-z0-9]+)*$`)
  const icons: unknown[] = value.icons
  if (
    !icons.every((icon: unknown): icon is string => typeof icon === 'string' && pattern.test(icon))
  )
    return
  return uniq(icons)
}
