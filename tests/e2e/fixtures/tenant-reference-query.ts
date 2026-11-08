import { useSupabase } from '@/hooks/core/useSupabase'
import { withRequestOptions } from '@/api/providers/supabase/query'
import { fetchUnitDisplayOptions } from '@/api/unit-of-measure'
import {
  getDataApiTenantScopeHeader,
  readTenantScopeId,
  writePlatformTenantScopeActive,
  writeTenantScopeId
} from '@/utils/tenant-scope-context'

interface ReferenceRow {
  id: string
  tenantId: string
}

const { supabase, responseHandle } = useSupabase()
const controller = {
  setScope(platform: boolean, selected: string | null): void {
    writePlatformTenantScopeActive(platform)
    writeTenantScopeId(selected)
  },
  selected: readTenantScopeId,
  header: getDataApiTenantScopeHeader,
  units: fetchUnitDisplayOptions,
  async projects(tenants: string[], readTenantId?: string | null): Promise<ReferenceRow[]> {
    let query = supabase.from('mdm_project').select('id,tenant_id')
    query =
      tenants.length === 1 ? query.eq('tenant_id', tenants[0]) : query.in('tenant_id', tenants)
    const response = await responseHandle<ReferenceRow[]>(
      () => withRequestOptions(query, { readTenantId }),
      { breakReturn: true, showErrorMessage: false }
    )
    return response.data ?? []
  }
}

export type TenantReferenceController = typeof controller

declare global {
  interface Window {
    __tenantReferenceQuery: TenantReferenceController
  }
}

window.__tenantReferenceQuery = controller
