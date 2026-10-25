import { useSupabase } from '@/hooks/core/useSupabase'
import { createEmployeeReferenceSelector } from '@/api/integration/employees'
import type { MasterDataDeleteDependencyDetail } from '@/api/master-data-delete'
import type {
  PayableSettlementAction,
  PayableSettlementDocument,
  PayableSettlementKind,
  PayableSettlementOptions,
  PayableSettlementTypeOption,
  PayableSettlementQuery
} from './payable-settlement.types'
export * from './payable-settlement.types'

export const fetchPayableEmployeeSelector = createEmployeeReferenceSelector(async (tenantId) => {
  const result = await responseHandle<
    Array<{ id: string; tenantId: string; code: string; name: string }>
  >(() => supabase.rpc('fms_payable_employee_options_secure', { p_tenant_id: tenantId }), options)
  return { data: result.data, error: result.error }
})

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const options = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '付款业务操作失败，请刷新后重试'
}
export async function fetchSettlementDeleteDestination(
  id: string
): Promise<PayableSettlementKind | null> {
  const { data } = await responseHandle<{ kind: PayableSettlementKind }>(
    () =>
      supabase.from('fms_payable_settlement_document').select('kind').eq('id', id).maybeSingle(),
    options
  )
  return data?.kind === 'application' || data?.kind === 'payment' || data?.kind === 'refund'
    ? data.kind
    : null
}

export async function fetchPayableSettlements(
  kind: PayableSettlementKind,
  query: PayableSettlementQuery
): Promise<{ data: PayableSettlementDocument[]; total: number }> {
  const { data } = await responseHandle<{ data: PayableSettlementDocument[]; total: number }>(
    () =>
      supabase.rpc('fms_payable_settlement_list_secure', {
        p_kind: kind,
        p_query: keysToSnakeDeep(query)
      }),
    options
  )
  if (!data || !Array.isArray(data.data)) throw new Error('付款单据加载失败，请重试')
  return data
}
export async function savePayableSettlement(
  document: PayableSettlementDocument
): Promise<PayableSettlementDocument> {
  const { data } = await responseHandle<PayableSettlementDocument>(
    () =>
      supabase.rpc('fms_save_payable_settlement_secure', { p_document: keysToSnakeDeep(document) }),
    options
  )
  if (!data?.id) throw new Error('付款单据尚未保存，请重试')
  return data
}
export async function fetchPayableSettlementOptions(
  kind: PayableSettlementKind,
  tenantId?: string
): Promise<PayableSettlementOptions> {
  const { data } = await responseHandle<PayableSettlementOptions>(
    () =>
      supabase.rpc('fms_payable_settlement_options_secure', {
        p_kind: kind,
        p_tenant_id: tenantId || null
      }),
    options
  )
  if (!data || !Array.isArray(data.purpose) || !Array.isArray(data.method))
    throw new Error('付款参选资料加载失败，请重试')
  return data
}
export async function fetchPayableSettlementTypeOptions(
  kind: PayableSettlementKind
): Promise<PayableSettlementTypeOption[]> {
  const { data } = await responseHandle<PayableSettlementTypeOption[]>(
    () => supabase.rpc('fms_payable_settlement_type_options_secure', { p_kind: kind }),
    options
  )
  if (
    !Array.isArray(data) ||
    data.some(
      (item) =>
        !item ||
        typeof item.id !== 'string' ||
        typeof item.name !== 'string' ||
        typeof item.enabled !== 'boolean'
    )
  )
    throw new Error('单据类型加载失败，请重试')
  return data
}
export async function actPayableSettlement(
  ids: string[],
  action: PayableSettlementAction,
  reason = ''
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('fms_act_payable_settlement_secure', {
        p_ids: ids,
        p_action: action,
        p_reason: reason
      }),
    options
  )
}
export async function pushPayableSettlement(
  id: string,
  kind: PayableSettlementKind,
  source: 'payable' | 'application' | 'purchase' | 'payment' = 'payable'
): Promise<PayableSettlementDocument> {
  const { data } = await responseHandle<PayableSettlementDocument>(
    () =>
      supabase.rpc('fms_push_payable_settlement_secure', {
        p_id: id,
        p_kind: kind,
        p_source: source
      }),
    options
  )
  if (!data?.id) throw new Error('未生成下游付款单据，请刷新后重试')
  return data
}
export async function fetchSettlementDeleteDependencies(
  ids: string[]
): Promise<MasterDataDeleteDependencyDetail[]> {
  const { data } = await responseHandle<MasterDataDeleteDependencyDetail[]>(
    () => supabase.rpc('fms_payable_settlement_delete_dependencies_secure', { p_ids: ids }),
    options
  )
  if (!Array.isArray(data)) throw new Error('付款关联检查失败，请重试后再删除')
  return data
}
