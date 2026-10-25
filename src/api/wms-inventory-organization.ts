import { useSupabase } from '@/hooks/core/useSupabase'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import { loadAllDocumentPages } from '@/utils/business/document-detail-list'

const { supabase, responseHandle } = useSupabase()
const readOptions = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '库存组织加载失败，请重试'
}

export interface WmsInventoryOrganizationOption {
  id: string
  tenantId: string
  organizationCode: string
  organizationName: string
  organizationType: string
  status: string
  enabledOn: string | null
  isDefault: boolean
  initializationClosedAt: string | null
}

type WmsInventoryOrganizationOptionRecord = Omit<
  WmsInventoryOrganizationOption,
  'enabledOn' | 'isDefault' | 'initializationClosedAt'
> & {
  initialization:
    | Pick<WmsInventoryOrganizationOption, 'enabledOn' | 'isDefault' | 'initializationClosedAt'>
    | Array<
        Pick<WmsInventoryOrganizationOption, 'enabledOn' | 'isDefault' | 'initializationClosedAt'>
      >
    | null
}

export async function fetchWmsInventoryOrganizationOptions(
  tenantId?: string,
  organizationType?: string,
  keyword?: string
): Promise<WmsInventoryOrganizationOption[]> {
  const organizations = await loadAllDocumentPages<
    WmsInventoryOrganizationOptionRecord,
    { from?: number; to?: number }
  >(
    ({ from = 0, to = 499 }) =>
      responseHandle<WmsInventoryOrganizationOptionRecord[]>(() => {
        let request = supabase
          .from('mdm_organization')
          .select(
            'id,tenant_id,organization_code,organization_name,organization_type,status,initialization:wms_inventory_initialization!wms_inventory_initialization_organization_id_fkey(enabled_on,is_default,initialization_closed_at)',
            { count: 'exact' }
          )
          .eq('status', '1')
          .order('organization_code')
          .order('id')
          .range(from, to)
        if (tenantId) request = request.eq('tenant_id', tenantId)
        if (organizationType) request = request.eq('organization_type', organizationType)
        if (keyword?.trim())
          request = request.or(
            buildOrIlikeFilter(['organization_code', 'organization_name'], keyword)
          )
        return request
      }, readOptions),
    {}
  )
  return organizations.map(({ initialization, ...row }): WmsInventoryOrganizationOption => {
    if (Array.isArray(initialization) && initialization.length > 1) {
      throw new Error('库存组织初始化记录不唯一，请检查数据后重试')
    }
    const state = Array.isArray(initialization) ? initialization[0] : initialization
    return {
      ...row,
      enabledOn: state?.enabledOn ?? null,
      isDefault: state?.isDefault ?? false,
      initializationClosedAt: state?.initializationClosedAt ?? null
    }
  })
}
