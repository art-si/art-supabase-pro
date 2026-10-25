import { isPlainObject } from 'lodash-es'

/** Narrow JSON-shaped records without accepting arrays or class instances. */
export const isPlainObjectRecord = (value: unknown): value is Record<string, unknown> =>
  isPlainObject(value)
