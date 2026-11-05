import { useEventListener } from '@vueuse/core'
import { toValue, type MaybeRefOrGetter } from 'vue'
import { useGlobalFocusPreference } from '@/hooks/core/useGlobalFocusPreference'

interface WorkspaceFocusOptions {
  /** 某些复合工作区仅在指定步骤允许自动进入专注。 */
  autoFocus?: MaybeRefOrGetter<boolean>
}

/**
 * 管理非 ArtTableQuery 业务工作区的专注状态。
 * 页面负责决定专注时保留的工作区，这里统一 Esc 与缓存页面退出行为。
 */
export function useWorkspaceFocus(options: WorkspaceFocusOptions = {}) {
  const focusMode = ref(false)
  const preference = useGlobalFocusPreference()
  let pageActive = false
  let manuallyExited = false

  const setFocusMode = (value: boolean): void => {
    focusMode.value = value
  }

  const applyPreference = (): void => {
    if (!pageActive || !preference.initialized.value || !preference.enabled.value) return
    if (!manuallyExited && toValue(options.autoFocus ?? true)) setFocusMode(true)
  }

  const enterPage = (): void => {
    pageActive = true
    manuallyExited = false
    applyPreference()
  }

  watch(
    focusMode,
    (focused) => {
      if (!focused && pageActive && preference.enabled.value) manuallyExited = true
    },
    { flush: 'sync' }
  )

  watch(
    [preference.enabled, preference.initialized],
    ([enabled, initialized], [previousEnabled]) => {
      if (!pageActive || !initialized) return
      if (!enabled && previousEnabled) {
        setFocusMode(false)
        return
      }
      if (enabled && !previousEnabled) manuallyExited = false
      applyPreference()
    },
    { flush: 'post' }
  )

  watch(
    () => toValue(options.autoFocus ?? true),
    (allowed) => {
      if (allowed) applyPreference()
    },
    { flush: 'post' }
  )

  useEventListener(document, 'keydown', (event) => {
    if (event.key === 'Escape' && focusMode.value) setFocusMode(false)
  })

  onMounted(enterPage)
  onActivated(enterPage)
  onDeactivated(() => {
    pageActive = false
    setFocusMode(false)
  })
  onBeforeUnmount(() => {
    pageActive = false
    setFocusMode(false)
  })

  return {
    focusMode,
    setFocusMode
  }
}
