import TreeUtils from '@/utils/tree'

/** 只有当前呈现的数据包含目标记录，且读取已结束并成功，才能确认定位。 */
export function hasLocatedRecord(
  rows: readonly object[],
  target: string | number | undefined,
  loading: boolean,
  error: unknown,
  recordKey = 'id'
): boolean {
  if (loading || error || target === undefined || target === '') return false
  const tree = new TreeUtils({ idKey: recordKey })
  const records = [...rows]
  if (tree.findNode(records, target)) return true
  if (typeof target !== 'string') return false
  const numericTarget = Number(target)
  return (
    Number.isSafeInteger(numericTarget) &&
    String(numericTarget) === target &&
    Boolean(tree.findNode(records, numericTarget))
  )
}
