import { shallowRef } from 'vue'
import { uniq } from 'lodash-es'
import {
  fetchMaterialUnitCompatibilityOptions,
  fetchUnitDisplayOptions
} from '@/api/unit-of-measure'
import { createUnitDisplayIndex, resolveUnitDisplayName } from '@/utils/business/unit-display'

export function useUnitDisplayNames() {
  const index = shallowRef(createUnitDisplayIndex([]))
  let revision = 0

  async function loadUnitDisplayNames(
    tenantIds: string[],
    sourceCode?: 'tmsCargoUnit'
  ): Promise<void> {
    const current = ++revision
    const tenants = uniq(tenantIds.filter(Boolean))
    if (!tenants.length) {
      index.value = createUnitDisplayIndex([])
      return
    }
    const [units, compatibility] = await Promise.all([
      fetchUnitDisplayOptions(tenants),
      sourceCode ? fetchMaterialUnitCompatibilityOptions(sourceCode) : Promise.resolve(null)
    ])
    if (current === revision)
      index.value = createUnitDisplayIndex(
        units,
        (compatibility?.data ?? []).filter(
          (item) => item.tenantId && tenants.includes(item.tenantId)
        )
      )
  }

  function unitDisplayName(tenantId: string, value?: string | null): string {
    return resolveUnitDisplayName(index.value, tenantId, value)
  }

  return { loadUnitDisplayNames, unitDisplayName }
}
