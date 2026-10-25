import type { MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { resolveTenantReadTargetId } from '@/utils/tenant-scope-access-policy'

/** Undefined rejects an out-of-scope target; null retains platform-all reads. */
export function useTenantReadTarget(tenantId?: MaybeRefOrGetter<string | null | undefined>) {
  const scope = useTenantScopeStore()
  return computed(() =>
    resolveTenantReadTargetId({
      effectiveTenantId: scope.effectiveTenantId,
      requestedTenantId: toValue(tenantId),
      isPlatformSuper: scope.isPlatformScope
    })
  )
}
