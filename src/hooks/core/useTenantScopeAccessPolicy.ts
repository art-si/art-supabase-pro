import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { resolveTenantScopeReadOnly } from '@/utils/tenant-scope-access-policy'

/**
 * Keeps aggregate scopes read-only for non-privileged viewers. Platform super administrators
 * retain their global mutation capability; RPC/RLS still validates the target tenant on write.
 */
export function useTenantScopeAccessPolicy() {
  const route = useRoute()
  const { isAllTenants } = storeToRefs(useTenantScopeStore())
  const { isPlatformSuper } = storeToRefs(useUserStore())
  const isCrossTenantReadOnly = computed(() =>
    resolveTenantScopeReadOnly({
      isAllTenants: isAllTenants.value,
      isPlatformSuper: isPlatformSuper.value,
      routePath: route.path
    })
  )

  return { isCrossTenantReadOnly }
}
