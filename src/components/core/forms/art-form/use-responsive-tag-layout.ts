import { useResizeObserver } from '@vueuse/core'
import { shallowReactive } from 'vue'

const compactTagWidth = 320

export function useResponsiveTagLayout() {
  const fields = shallowReactive(new Map<string, HTMLElement>())
  const compactFields = shallowReactive(new Set<string>())
  const fieldKeys = new WeakMap<Element, string>()

  useResizeObserver(
    () => [...fields.values()],
    (entries) => {
      for (const { target, contentRect } of entries) {
        const key = fieldKeys.get(target)
        if (key === undefined || fields.get(key) !== target || !contentRect.width) continue
        if (contentRect.width < compactTagWidth) compactFields.add(key)
        else compactFields.delete(key)
      }
    }
  )

  const track = (key: string, target: HTMLElement | null) => {
    if (target) {
      fields.set(key, target)
      fieldKeys.set(target, key)
    } else {
      fields.delete(key)
      compactFields.delete(key)
    }
  }

  return { track, isCompact: (key: string) => compactFields.has(key) }
}
