import { onScopeDispose, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useRoute } from 'vue-router'
import type { ArtTableQueryExpose } from '@/components/core/tables/art-table-query/index.vue'

/** Capture a route lifetime before awaiting work that will open or navigate UI. */
export function useRouteOperationGuard(): () => () => boolean {
  const route = useRoute()
  let version = 0
  watch(
    () => route.fullPath,
    () => version++,
    { flush: 'sync' }
  )
  onScopeDispose(() => version++)
  return () => {
    const capturedVersion = version
    return () => capturedVersion === version
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
