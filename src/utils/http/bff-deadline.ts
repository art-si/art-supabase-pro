export class BffDeadlineError extends Error {
  constructor(readonly reason: 'timeout' | 'aborted') {
    super(reason === 'timeout' ? 'BFF 请求超时' : 'BFF 请求已取消')
    this.name = 'BffDeadlineError'
  }
}

/** Bound the entire request, including auth preparation and a transport that ignores abort. */
export async function withBffDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<T> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 65_000)
    throw new BffDeadlineError('timeout')
  if (externalSignal?.aborted) throw new BffDeadlineError('aborted')
  const controller = new AbortController()
  let rejectDeadline: (error: BffDeadlineError) => void = () => undefined
  const deadline = new Promise<never>((_, reject) => {
    rejectDeadline = reject
  })
  const cancel = (reason: 'timeout' | 'aborted') => {
    if (controller.signal.aborted) return
    // The transport may settle synchronously in an abort listener.
    rejectDeadline(new BffDeadlineError(reason))
    controller.abort()
  }
  const onExternalAbort = () => cancel('aborted')
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true })
  const timer = setTimeout(() => cancel('timeout'), timeoutMs)
  try {
    let request: Promise<T>
    try {
      request = operation(controller.signal)
    } catch (error) {
      request = Promise.reject(error)
    }
    return await Promise.race([deadline, request])
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', onExternalAbort)
  }
}
