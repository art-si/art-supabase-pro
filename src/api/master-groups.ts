import { useSupabase } from '@/hooks/core/useSupabase'

export type MasterGroupDomain =
  'customer' | 'material' | 'project' | 'operation' | 'process-route' | 'supplier'

export interface MasterGroup {
  id: string
  tenantId: string
  domain: MasterGroupDomain
  parentId: string | null
  code: string
  name: string
  sort: number
  enabled: boolean
  remark: string
}

const { supabase, responseHandle } = useSupabase()

export async function fetchMasterGroups(
  domain: MasterGroupDomain,
  tenantId?: string | null
): Promise<MasterGroup[]> {
  let query = supabase
    .from('mdm_master_group')
    .select('*')
    .eq('domain', domain)
    .order('sort')
    .order('code')
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data } = await responseHandle<MasterGroup[]>(() => query, {
    breakReturn: true,
    showErrorMessage: false,
    errorMessage: '分组加载失败，请重试'
  })
  return data ?? []
}
