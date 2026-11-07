import { onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useRoute } from 'vue-router'
import type { ArtTableQueryExpose } from '@/components/core/tables/art-table-query/index.vue'

/** Capture a route lifetime before awaiting work that will open or navigate UI. */
export function useRouteOperationGuard(): () => () => boolean {
  const route = useRoute()
  const version = ref(0)
  let active = true
  watch(
    () => route.fullPath,
    () => version.value++,
    { flush: 'sync' }
  )
  onScopeDispose(() => {
    active = false
    version.value++
  })
  return () => {
    const capturedVersion = version.value
    return () => active && capturedVersion === version.value
  }
}

export function useRouteTableContext(
  routePath: MaybeRefOrGetter<string>,
  table: MaybeRefOrGetter<
    Pick<ArtTableQueryExpose, 'clearSelection' | 'refreshContext'> | undefined
  >
): void {
  const route = useRoute()
  watch(
    () => (route.path === toValue(routePath) ? route.fullPath : ''),
    async (context) => {
      if (!context) return
      const current = toValue(table)
      current?.clearSelection()
      await current?.refreshContext()
    },
    { flush: 'post' }
  )
}
