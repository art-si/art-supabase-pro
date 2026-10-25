/** Bound SDK work and release its deadline timer on either success or failure. */
export async function withTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
  signal?: AbortSignal
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  let removeAbortListener: (() => void) | undefined
  const aborted =
    signal &&
    new Promise<never>((_resolve, reject) => {
      const abort = () => reject(signal.reason ?? new DOMException('请求已取消', 'AbortError'))
      if (signal.aborted) abort()
      else {
        signal.addEventListener('abort', abort, { once: true })
        removeAbortListener = () => signal.removeEventListener('abort', abort)
      }
    })
  try {
    return await Promise.race([
      ...(aborted ? [aborted] : []),
      task,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
      })
    ])
  } finally {
    clearTimeout(timeout)
    removeAbortListener?.()
  }
}

/** Preserve input order; stop scheduling on failure and drain active work before rejecting. */
export async function mapWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new RangeError('并发数必须是正安全整数')
  }
  if (items.length === 0) return []

  const workerCount = Math.min(concurrency, items.length)
  const results = new Array<TOutput>(items.length)
  let nextIndex = 0
  let failed = false
  let firstError: unknown

  const worker = async (): Promise<void> => {
    while (!failed && nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      try {
        results[index] = await mapper(items[index], index)
      } catch (error) {
        if (!failed) firstError = error
        failed = true
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  if (failed) throw firstError
  return results
}
