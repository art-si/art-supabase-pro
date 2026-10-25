import { useSupabase } from '@/hooks/core/useSupabase'

const { supabase, responseHandle } = useSupabase()

export interface WmsInitializationReconciliationRow {
  id: string
  balanceType: 'stock' | 'receivable' | 'estimated_payable'
  sourceArea: 'stock' | 'sales' | 'purchase'
  documentId: string
  documentNo: string
  status: string
  counterpartyName: string | null
  materialCode: string
  materialName: string
  warehouseName: string | null
  binName: string | null
  batchNo: string | null
  quantity: number
  unitName: string | null
  amount: number
  taxAmount: number
  totalAmount: number
  pushed: boolean
}

export async function fetchWmsInitializationReconciliation(
  organizationId: string
): Promise<WmsInitializationReconciliationRow[]> {
  const result = await responseHandle<WmsInitializationReconciliationRow[]>(
    () =>
      supabase.rpc('wms_initialization_reconciliation_secure', {
        p_organization_id: organizationId
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '初始化对账加载失败，请重试' }
  )
  if (result.error || !result.data)
    throw new Error('初始化对账加载失败，请重试', { cause: result.error })
  return result.data
}

export async function pushWmsInitialObligation(
  area: 'sales' | 'purchase',
  documentId: string
): Promise<string> {
  const result = await responseHandle<string>(
    () =>
      supabase.rpc('wms_push_initial_obligation_secure', {
        p_area: area,
        p_document_id: documentId
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '期初往来下推失败，请重试' }
  )
  if (result.error || !result.data) throw result.error || new Error('期初往来下推失败，请重试')
  return result.data
}
