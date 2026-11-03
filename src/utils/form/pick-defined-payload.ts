import { pick, pickBy } from 'lodash-es'

/** Keep an explicit write whitelist while preserving null, false and zero values. */
export function pickDefinedPayload<
  TRecord extends object,
  TKey extends Extract<keyof TRecord, string>
>(record: TRecord, keys: readonly TKey[]): Record<string, unknown> {
  return pickBy(pick(record, keys), (value) => value !== undefined)
}
