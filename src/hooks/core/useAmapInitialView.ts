import { onDeactivated, onScopeDispose } from 'vue'
import type { AmapDeviceLocation } from './useAmapGeolocation'

/** Resolve a view-only location; later interaction, teardown or reopening cancels stale work. */
export function useAmapInitialView(
  getCurrentLocation: (signal?: AbortSignal) => Promise<AmapDeviceLocation>
) {
  let pending: AbortController | undefined

  function cancel(): void {
    const current = pending
    pending = undefined
    current?.abort()
  }

  async function resolveCenter(): Promise<[number, number] | undefined> {
    cancel()
    const current = new AbortController()
    pending = current
    try {
      const location = await getCurrentLocation(current.signal)
      if (pending !== current || current.signal.aborted) return
      return [location.longitude, location.latitude]
    } catch (error) {
      if (pending === current && !current.signal.aborted) throw error
    } finally {
      if (pending === current) pending = undefined
    }
  }

  onDeactivated(cancel)
  onScopeDispose(cancel)
  return { resolveCenter, cancel }
}
