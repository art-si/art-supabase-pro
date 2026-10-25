interface PollingSubscriptionOptions {
  intervalMs?: number
}

/** Replace unsupported database change feeds with a bounded, visibility-aware refresh signal. */
export const createPollingSubscription = (
  onChange: () => void,
  options: PollingSubscriptionOptions = {}
): (() => void) => {
  const intervalMs = Math.max(options.intervalMs ?? 15_000, 5_000)
  let stopped = false
  const refresh = () => {
    if (!stopped && (typeof document === 'undefined' || document.visibilityState === 'visible')) {
      onChange()
    }
  }
  const intervalId = setInterval(refresh, intervalMs)
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') refresh()
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }

  return () => {
    stopped = true
    clearInterval(intervalId)
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }
}
