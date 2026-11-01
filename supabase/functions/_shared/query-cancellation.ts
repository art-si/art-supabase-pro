/** A request owns its Postgres client and never reuses it for another execution. */
export type CancellableSqlQuery<T> = PromiseLike<T>

export class SqlQueryCancelledError extends Error {
  readonly code = 'SQL_QUERY_CANCELLED'
  constructor() {
    super('查询已取消')
  }
}

/** The registry coordinates isolates; only the owner can signal the transaction it still holds. */
export function createQueryCancellation(
  readState: () => Promise<string>,
  cancelActive: () => Promise<void>,
  intervalMs = 500
) {
  let cancelled = false
  let stopped = false
  let active = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let polling: Promise<void> | null = null
  let controlError: unknown

  const check = async () => {
    const state = await readState()
    if (state === 'cancel_requested') cancelled = true
    else if (state !== 'running') throw new Error('查询状态已失效，请重新执行')
    if (cancelled) throw new SqlQueryCancelledError()
  }
  const poll = () => {
    timer = setTimeout(() => {
      if (stopped || !active) return
      polling = check()
        .catch(async (error: unknown) => {
          controlError = error
          // Do not discard a response and leave a write executing in the database.
          if (active) await cancelActive()
        })
        .catch((error: unknown) => {
          controlError = error
        })
        .finally(() => {
          polling = null
          if (!stopped && !controlError && active) poll()
        })
    }, intervalMs)
  }
  const run = async <T>(query: () => CancellableSqlQuery<T>): Promise<T> => {
    if (controlError) throw controlError
    await check()
    const pending = query()
    active = true
    poll()
    try {
      const value = await pending
      if (polling) await polling
      if (controlError) throw controlError
      await check()
      return value
    } catch (error) {
      if (polling) await polling
      const timeout = error instanceof Error && /statement timeout/i.test(error.message)
      if (controlError && !timeout) throw controlError
      throw error
    } finally {
      active = false
      clearTimeout(timer)
    }
  }
  return {
    run,
    async stop() {
      stopped = true
      clearTimeout(timer)
      if (polling) await polling
    }
  }
}
