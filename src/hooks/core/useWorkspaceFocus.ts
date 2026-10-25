import { useEventListener } from '@vueuse/core'

/**
 * 管理非 ArtTableQuery 业务工作区的专注状态。
 * 页面负责决定专注时保留的工作区，这里统一 Esc 与缓存页面退出行为。
 */
export function useWorkspaceFocus() {
  const focusMode = ref(false)

  const setFocusMode = (value: boolean): void => {
    focusMode.value = value
  }

  useEventListener(document, 'keydown', (event) => {
    if (event.key === 'Escape' && focusMode.value) setFocusMode(false)
  })

  onDeactivated(() => setFocusMode(false))
  onBeforeUnmount(() => setFocusMode(false))

  return {
    focusMode,
    setFocusMode
  }
}
