export interface DeleteReferenceContext {
  table: string
  ids: string[]
  constraint?: string
}

export class DeleteReferenceBlockedError extends Error {
  constructor(cause: unknown) {
    super('删除受阻，请处理弹窗中的关联记录后重试', { cause })
    this.name = 'DeleteReferenceBlockedError'
  }
}

/** PostgreSQL distinguishes an inbound reference from a missing insert/update reference. */
export function getDeleteReferenceContext(
  error: unknown,
  depth = 0
): DeleteReferenceContext | null {
  if (!error || typeof error !== 'object' || depth > 4) return null
  if ('cause' in error) {
    const nested = getDeleteReferenceContext(error.cause, depth + 1)
    if (nested) return nested
  }
  if (!('code' in error) || error.code !== '23503') return null
  if (!('message' in error) || typeof error.message !== 'string') return null
  if (!('details' in error) || typeof error.details !== 'string') return null
  const relation =
    /(?:update or delete|delete) on table "([a-z][a-z0-9_]*)" violates foreign key constraint "([a-z][a-z0-9_]*)"/.exec(
      error.message
    )
  const key = /Key \(([^)]+)\)=\(([^)]+)\) is still referenced from table/.exec(error.details)
  if (!relation || !key) return null
  const columns = key[1].split(',').map((value) => value.trim())
  const values = key[2].split(',').map((value) => value.trim())
  const id = values[columns.indexOf('id')]
  if (!id || !/^(?:[0-9]+|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.test(id)) return null
  return { table: relation[1], ids: [id], constraint: relation[2] }
}
