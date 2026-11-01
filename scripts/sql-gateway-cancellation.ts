/** One control belongs to one dedicated database session and one HTTP operation. */
export class SqlQueryCancelledError extends Error {
  readonly code = 'SQL_QUERY_CANCELLED'
  readonly status = 409

  constructor(options?: ErrorOptions) {
    super('查询已取消', options)
  }
}

export class SqlQueryCancellation {
  requested = false
  private interrupt?: () => Promise<void>
  private pending?: Promise<void>
  private closed = false

  throwIfRequested(): void {
    if (this.requested) throw new SqlQueryCancelledError()
    if (this.closed) throw new Error('查询超时或连接中断，请减少查询范围后重试')
  }

  async cancel(): Promise<void> {
    this.requested = true
    if (this.pending) return this.pending
    if (!this.interrupt) return
    this.pending = this.interrupt()
      .catch((cause: unknown) => {
        this.requested = false
        throw new Error('取消请求未能送达数据库，请重试或等待查询超时', { cause })
      })
      .finally(() => {
        this.pending = undefined
      })
    return this.pending
  }

  async run<T>(operation: () => Promise<T>, interrupt: () => Promise<void>): Promise<T> {
    this.throwIfRequested()
    this.interrupt = interrupt
    try {
      return await operation()
    } catch (cause) {
      const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : undefined
      if (
        this.requested &&
        ['57014', 'ER_QUERY_INTERRUPTED'].includes(String(code)) &&
        !(cause instanceof Error && /statement timeout/i.test(cause.message))
      )
        throw new SqlQueryCancelledError({ cause })
      throw cause
    } finally {
      this.interrupt = undefined
      // Keep the session alive until the cancellation packet/KILL has completed:
      // a late cancellation can never target a reused connection or thread ID.
      await this.pending?.catch(() => undefined)
    }
  }

  async close(closeSession: () => void | Promise<void>): Promise<void> {
    // Timeouts and ordinary cleanup share this fence. No new cancellation may
    // acquire a session that is closing, and an in-flight packet keeps it alive.
    this.closed = true
    this.interrupt = undefined
    await this.pending?.catch(() => undefined)
    await closeSession()
  }
}

interface QueryEntry {
  control: SqlQueryCancellation | null
  expires: number
  cancelled: boolean
}

/** Bounded, short-lived IDs also remember cancellation arriving before query authorization. */
export class SqlQueryRegistry {
  private entries = new Map<string, QueryEntry>()

  private prune(): void {
    const now = Date.now()
    for (const [key, entry] of this.entries)
      if (!entry.control && entry.expires <= now) this.entries.delete(key)
    if (this.entries.size >= 2000) throw new Error('取消请求过多，请稍后重试')
  }

  begin(key: string): SqlQueryCancellation {
    this.prune()
    const previous = this.entries.get(key)
    if (previous?.cancelled) throw new SqlQueryCancelledError()
    if (previous) throw new Error('查询请求编号已使用，请重新执行')
    const control = new SqlQueryCancellation()
    this.entries.set(key, { control, expires: 0, cancelled: false })
    return control
  }

  finish(key: string): void {
    const entry = this.entries.get(key)
    if (!entry) return
    this.entries.set(key, { control: null, expires: Date.now() + 120000, cancelled: false })
  }

  async cancel(key: string): Promise<'cancel_requested' | 'not_running'> {
    this.prune()
    const entry = this.entries.get(key)
    if (entry?.control) {
      await entry.control.cancel()
      return 'cancel_requested'
    }
    if (entry && !entry.cancelled) return 'not_running'
    this.entries.set(key, { control: null, expires: Date.now() + 120000, cancelled: true })
    return 'cancel_requested'
  }
}
