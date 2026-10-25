import { shallowRef } from 'vue'
import { fetchUnitDisplayOptions } from '@/api/unit-of-measure'
import { createUnitDisplayIndex, resolveUnitDisplayName } from '@/utils/business/unit-display'

export function useUnitDisplayNames() {
  const index = shallowRef(createUnitDisplayIndex([]))
  let revision = 0

  async function loadUnitDisplayNames(tenantIds: string[]): Promise<void> {
    const current = ++revision
    const units = await fetchUnitDisplayOptions(tenantIds)
    if (current === revision) index.value = createUnitDisplayIndex(units)
  }

  function unitDisplayName(tenantId: string, value?: string | null): string {
    return resolveUnitDisplayName(index.value, tenantId, value)
  }

  return { loadUnitDisplayNames, unitDisplayName }
}
