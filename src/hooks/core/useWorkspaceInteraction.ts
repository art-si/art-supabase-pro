import { computed, getCurrentScope, ref, watch, type ComputedRef } from 'vue'
import { useUserStore } from '@/store/modules/user'

/** 锁屏或卸载后，旧的界面交互意图永久失效；解锁需要新的操作。 */
export function useWorkspaceInteraction(): {
  isLocked: ComputedRef<boolean>
  lockRevision: ComputedRef<number>
  captureIntent: () => () => boolean
} {
  const userStore = useUserStore()
  const scope = getCurrentScope()
  const isLocked = computed(() => userStore.isLock)
  const lockRevision = ref(0)
  watch(
    isLocked,
    (locked) => {
      if (locked) lockRevision.value++
    },
    { flush: 'sync' }
  )

  function captureIntent(): () => boolean {
    const allowed = !isLocked.value
    const revision = lockRevision.value
    return () =>
      allowed && Boolean(scope?.active) && !isLocked.value && revision === lockRevision.value
  }

  return { isLocked, lockRevision: computed(() => lockRevision.value), captureIntent }
}
