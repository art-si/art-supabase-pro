import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'

interface TenantScopedFormItem {
  key: string
}

/**
 * Resolves the tenant used by create forms.
 * A concrete shell scope supplies the tenant automatically. In the all-tenant scope, new
 * business records default to the administrator's home tenant; ArtForm hides the duplicate
 * business selector while system ownership forms may opt into manual tenant assignment.
 */
export function useTenantScopeFormPolicy() {
  const { isAllTenants, effectiveTenantId: selectedTenantId } = storeToRefs(useTenantScopeStore())
  const userStore = useUserStore()
  const effectiveTenantId = computed(() => selectedTenantId.value ?? null)
  const defaultWriteTenantId = computed(
    () => selectedTenantId.value ?? userStore.getUserInfo.tenantId ?? null
  )
  const shouldExposeTenantField = computed(() => isAllTenants.value)
  const isTenantScopeItem = (item: TenantScopedFormItem): boolean => item.key === 'tenantId'

  return {
    effectiveTenantId,
    defaultWriteTenantId,
    shouldExposeTenantField,
    isTenantScopeItem
  }
}
