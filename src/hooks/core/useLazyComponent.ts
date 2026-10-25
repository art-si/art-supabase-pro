import { nextTick, shallowRef, type Component, type ShallowRef } from 'vue'

interface LazyComponentController {
  component: ShallowRef<Component | undefined>
  load: () => Promise<void>
}

/**
 * Defers downloading and mounting an imperative component until its first use.
 * Calling load again reuses the mounted component instance.
 */
export function useLazyComponent(
  loader: () => Promise<{ default: Component }>
): LazyComponentController {
  const component = shallowRef<Component>()
  let pendingLoad: Promise<void> | undefined

  const load = async (): Promise<void> => {
    if (!component.value) {
      pendingLoad ??= loader().then(({ default: loaded }) => {
        component.value = loaded
      })
      try {
        await pendingLoad
      } finally {
        pendingLoad = undefined
      }
    }
    await nextTick()
  }

  return { component, load }
}
