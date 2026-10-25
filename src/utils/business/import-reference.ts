import { memoize } from 'lodash-es'

/** Imported identifiers must resolve to one complete record before a business write. */
export function requireUniqueImportReference<T extends { id?: string }>(
  records: readonly T[],
  description: string
): T {
  const [record] = records
  if (!record?.id) throw new Error(`未找到${description}`)
  if (records.length !== 1) throw new Error(`${description}存在多个匹配记录，请核对编号后重新导入`)
  return record
}
/** A fresh lookup belongs to one import batch; the code identifies its selected reference. */
export function createImportReferenceLookup<T extends { id?: string }>(
  resolve: (code: string) => Promise<readonly T[]>
): (code: string, description: string) => Promise<T> {
  return memoize(async (code: string, description: string) =>
    requireUniqueImportReference(await resolve(code), description)
  )
}
