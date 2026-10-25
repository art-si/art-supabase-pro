import { nextTick, onScopeDispose } from 'vue'
import { useEventListener } from '@vueuse/core'

/** Own the rendered print sheet, browser listener and cleanup for its component scope. */
export function usePrintSheet(bodyClass: string, onFinished: () => void) {
  let generation = 0
  let active = false
  const cleanup = (): void => {
    generation += 1
    document.body.classList.remove(bodyClass)
    if (active) {
      active = false
      onFinished()
    }
  }
  useEventListener(window, 'afterprint', () => {
    if (active) cleanup()
  })
  onScopeDispose(cleanup)
  const print = async (): Promise<void> => {
    const current = ++generation
    active = true
    document.body.classList.add(bodyClass)
    await nextTick()
    if (current !== generation) return
    try {
      window.print()
    } catch (error) {
      cleanup()
      throw error
    }
  }
  return { print }
}
