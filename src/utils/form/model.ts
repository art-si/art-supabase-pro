import { difference, omit } from 'lodash-es'

/** Persist ordered editor rows without their UI-only identity or stale sort values. */
export function serializeOrderedEditorRows<T extends { localKey: string; sort?: number }>(
  rows: readonly T[]
): Array<Omit<T, 'localKey' | 'sort'> & { sort: number }> {
  return rows.map((row, index) => ({
    ...omit<T, 'localKey' | 'sort'>(row, ['localKey', 'sort']),
    sort: index
  }))
}

/** Replace model fields without detaching consumers of the existing reactive object. */
export function replaceReactiveModel<T extends object>(current: T, next: object): T {
  for (const key of difference(Object.keys(current), Object.keys(next))) {
    Reflect.deleteProperty(current, key)
  }
  return Object.assign(current, next)
}
