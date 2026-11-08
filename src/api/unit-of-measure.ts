import { uniq } from 'lodash-es'
import { useSupabase } from '@/hooks/core/useSupabase'
import { fetchAllRangePages } from '@/utils/supabase/pagination'
import type { UnitDisplayOption } from '@/utils/business/unit-display'
import { withRequestOptions } from '@/api/providers/supabase/query'
import { assertTenantReadTargetId, createTenantScopeReadGuard } from '@/utils/tenant-scope-context'

const { supabase, responseHandle } = useSupabase()

/** Historical TMS/SMIS field values resolve through tenant-owned MDM units, never dictionaries. */
export async function fetchMaterialUnitCompatibilityOptions(sourceCode?: string) {
  return responseHandle<
    Array<Api.DataCenter.DictListItem & { dictTypeTable: { code: string; name: string } }>
  >(
    () =>
      supabase.rpc('material_unit_compatibility_options', { p_source_code: sourceCode ?? null }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '计量单位加载失败，请重试' }
  )
}

export async function fetchUnitDisplayOptions(tenantIds: string[]): Promise<UnitDisplayOption[]> {
  const tenants = uniq(tenantIds.filter(Boolean))
  tenants.forEach(assertTenantReadTargetId)
  const assertTenantScope = createTenantScopeReadGuard()
  const unitBatches: UnitDisplayOption[][] = []
  for (let offset = 0; offset < tenants.length; offset += 100) {
    assertTenantScope()
    const batch = tenants.slice(offset, offset + 100)
    const result = await fetchAllRangePages<UnitDisplayOption>(({ from, to }) =>
      responseHandle<UnitDisplayOption[]>(
        () =>
          withRequestOptions(
            supabase
              .from('mdm_unit_of_measure')
              .select('id,tenant_id,unit_code,unit_name,symbol')
              .in('tenant_id', batch)
              .order('id')
              .range(from, to),
            { readTenantId: batch.length === 1 ? batch[0] : null }
          ),
        { breakReturn: true, showErrorMessage: false, errorMessage: '计量单位名称加载失败，请重试' }
      )
    )
    assertTenantScope()
    if (result.error) throw result.error
    unitBatches.push(result.data ?? [])
  }
  return unitBatches.flat()
}
