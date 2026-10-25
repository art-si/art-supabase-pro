import { useSupabase } from '@/hooks/core/useSupabase'

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()

export async function fetchWmsAssetAccountSets(tenantId: string) {
  const { data } = await responseHandle<{ records: Array<{ id: string; accountSetName: string }> }>(
    () =>
      supabase.rpc('fms_list_account_set_options_secure', {
        p_tenant_id: tenantId,
        p_status: 'active',
        p_ids: null,
        p_from: 0,
        p_to: 999
      }),
    { breakReturn: true, showErrorMessage: false }
  )
  return (data?.records || []).map((row) => ({ value: row.id, label: row.accountSetName }))
}

export async function fetchWmsAssetCategories(accountSetId: string) {
  const { data } = await responseHandle<
    Array<{ id: string; categoryName: string; isEnabled: boolean }>
  >(
    () =>
      supabase.rpc('fms_list_asset_categories_secure', {
        p_account_set_id: accountSetId,
        p_tenant_id: null
      }),
    { breakReturn: true, showErrorMessage: false }
  )
  return (data || [])
    .filter((row) => row.isEnabled)
    .map((row) => ({ value: row.id, label: row.categoryName }))
}

export interface WmsAssetSelection {
  documentId: string
  lineIds: string[] | null
}

export async function pushWmsOtherAssets(payload: {
  accountSetId: string
  categoryId: string
  date: string
  selections: WmsAssetSelection[]
}): Promise<string[]> {
  const { data } = await responseHandle<string[]>(
    () =>
      supabase.rpc('wms_push_other_asset_secure', {
        p_account_set_id: payload.accountSetId,
        p_category_id: payload.categoryId,
        p_date: payload.date,
        p_selections: keysToSnakeDeep(payload.selections)
      }),
    { breakReturn: true, showErrorMessage: false }
  )
  if (!Array.isArray(data) || data.some((id) => typeof id !== 'string')) {
    throw new Error('资产草稿返回结果异常，请刷新固定资产列表核对')
  }
  return data
}
