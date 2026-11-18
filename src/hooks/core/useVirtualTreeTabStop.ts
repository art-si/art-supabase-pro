import { computed, shallowReactive, shallowRef } from 'vue'
import type { ComponentPublicInstance } from 'vue'

/** Keep a single Tab stop even when scrolling unmounts the last focused virtual row. */
export function useVirtualTreeTabStop<Key extends string | number>(
  getVisibleKeys: () => readonly Key[]
) {
  const focusedKey = shallowRef<Key>()
  const mountedKeys = shallowReactive(new Set<Key>())
  const tabStopKey = computed(() => {
    const key = focusedKey.value
    return key !== undefined && mountedKeys.has(key)
      ? key
      : getVisibleKeys().find((candidate) => mountedKeys.has(candidate))
  })

  const registerNode = (key: Key, element: Element | ComponentPublicInstance | null): void => {
    if (element) mountedKeys.add(key)
    else mountedKeys.delete(key)
  }
  const setFocusedKey = (key: Key | undefined): void => {
    focusedKey.value = key
  }

  return { tabStopKey, registerNode, setFocusedKey }
}
