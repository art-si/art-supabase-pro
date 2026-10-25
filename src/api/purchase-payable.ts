import { useSupabase } from '@/hooks/core/useSupabase'
import type { MasterDataDeleteDependencyDetail } from '@/api/master-data-delete'
import type {
  PurchasePayableDocument,
  PurchasePayableKind,
  PayableSearch,
  PayableAction,
  PayableOption,
  PaymentTerm,
  PayableCurrencyContext
} from './purchase-payable.types'
export * from './purchase-payable.types'

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const options = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '应付单操作失败，请重试'
}
export async function pushPurchasePayables(
  kind: PurchasePayableKind,
  selections: Array<{ documentId: string; lineIds: string[] | null }>
): Promise<PurchasePayableDocument[]> {
  const { data } = await responseHandle<PurchasePayableDocument[]>(
    () =>
      supabase.rpc('wms_push_purchase_payables_secure', {
        p_kind: kind,
        p_selections: selections.map((row) => ({
          document_id: row.documentId,
          line_ids: row.lineIds
        }))
      }),
    options
  )
  if (!data?.length) throw new Error('没有可下推的采购入库明细，请重新选择')
  return data
}
export async function fetchPurchasePayables(
  kind: PurchasePayableKind,
  params: PayableSearch
): Promise<{ data: PurchasePayableDocument[]; total: number }> {
  const { data } = await responseHandle<{ data: PurchasePayableDocument[]; total: number }>(
    () =>
      supabase.rpc('fms_purchase_payable_list_secure', {
        p_kind: kind,
        p_keyword: params.keyword || '',
        p_id: params.id || null,
        p_filters: keysToSnakeDeep({
          status: params.status,
          documentTypeId: params.documentTypeId,
          organizationId: params.organizationId,
          businessDateRange: params.businessDateRange,
          freezeStatus: params.freezeStatus,
          matchingStatus: params.matchingStatus,
          writeoffStatus: params.writeoffStatus,
          viewMode: params.viewMode
        }),
        p_limit: params.size,
        p_offset: (params.current - 1) * params.size
      }),
    options
  )
  if (!data || !Array.isArray(data.data)) throw new Error('应付单数据不完整，请重试')
  return data
}

export async function fetchPurchasePayableDeleteDestination(
  id: string
): Promise<PurchasePayableKind | null> {
  const { data } = await responseHandle<{ kind: PurchasePayableKind }>(
    () => supabase.from('fms_purchase_payable_document').select('kind').eq('id', id).maybeSingle(),
    options
  )
  return data?.kind === 'estimated' || data?.kind === 'financial' ? data.kind : null
}

export async function savePurchasePayable(
  document: PurchasePayableDocument
): Promise<PurchasePayableDocument> {
  const { data } = await responseHandle<PurchasePayableDocument>(
    () =>
      supabase.rpc('fms_save_purchase_payable_secure', { p_document: keysToSnakeDeep(document) }),
    options
  )
  if (!data?.id) throw new Error('应付单未保存，请刷新后重试')
  return data
}

export async function actPurchasePayable(
  ids: string[],
  action: PayableAction,
  reason = '',
  amount?: number
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('fms_act_purchase_payable_secure', {
        p_ids: ids,
        p_action: action,
        p_reason: reason,
        p_amount: amount ?? null
      }),
    options
  )
}

export async function fetchPayableOptions(
  kind: string,
  tenantId?: string,
  keyword = ''
): Promise<PayableOption[]> {
  const { data } = await responseHandle<PayableOption[]>(
    () =>
      supabase.rpc('fms_payable_options_secure', {
        p_kind: kind,
        p_tenant_id: tenantId || null,
        p_keyword: keyword
      }),
    options
  )
  if (!Array.isArray(data)) throw new Error('参选数据加载失败，请重试')
  return data
}
export async function fetchPayableCurrencyContext(
  document: PurchasePayableDocument
): Promise<PayableCurrencyContext> {
  const { data } = await responseHandle<PayableCurrencyContext>(
    () =>
      supabase.rpc('fms_payable_currency_context_secure', {
        p_kind: document.kind,
        p_date: document.businessDate,
        p_currency: document.currencyCode || 'CNY',
        p_tenant: document.tenantId || null,
        p_id: document.id || null
      }),
    options
  )
  if (!data || !Array.isArray(data.currencies) || typeof data.configured !== 'boolean')
    throw new Error('币种与记账汇率加载失败，请重试')
  return data
}

export async function fetchPayableDeleteDependencies(
  ids: string[]
): Promise<MasterDataDeleteDependencyDetail[]> {
  const { data } = await responseHandle<MasterDataDeleteDependencyDetail[]>(
    () => supabase.rpc('fms_payable_delete_dependencies_secure', { p_ids: ids }),
    options
  )
  if (!Array.isArray(data)) throw new Error('关联检查失败，请重试后再删除')
  return data
}

export async function pushEstimatedPayable(id: string): Promise<PurchasePayableDocument> {
  const { data } = await responseHandle<PurchasePayableDocument>(
    () => supabase.rpc('fms_push_estimated_payable_secure', { p_id: id }),
    options
  )
  if (!data?.id) throw new Error('财务应付单未生成，请重试')
  return data
}

export async function importCarrierPayable(
  kind: PurchasePayableKind,
  statementId: string
): Promise<PurchasePayableDocument> {
  const { data } = await responseHandle<PurchasePayableDocument>(
    () =>
      supabase.rpc('fms_import_carrier_payable_secure', {
        p_kind: kind,
        p_statement_id: statementId
      }),
    options
  )
  if (!data?.id) throw new Error('承运结算单未导入，请重试')
  return data
}

export async function generatePayableVoucher(
  id: string
): Promise<{ voucherId: string | null; eventId: string; status: string; message: string }> {
  const { data } = await responseHandle<{
    voucherId: string | null
    eventId: string
    status: string
    message: string
  }>(() => supabase.rpc('fms_payable_voucher_secure', { p_id: id }), options)
  if (!data) throw new Error('凭证生成失败，请重试')
  return data
}

export interface PayableVoucherPreview {
  message: string
  lines: Array<{
    summary: string
    subjectCode: string
    subjectName: string
    debitAmount: number
    creditAmount: number
  }>
}

export async function previewPayableVoucher(id: string): Promise<PayableVoucherPreview> {
  const { data } = await responseHandle<PayableVoucherPreview>(
    () => supabase.rpc('fms_preview_payable_voucher_secure', { p_id: id }),
    options
  )
  if (!data || !Array.isArray(data.lines)) throw new Error('凭证预览加载失败，请重试')
  return data
}

export async function fetchPaymentTerms(params: {
  current: number
  size: number
  keyword?: string
}): Promise<{ data: PaymentTerm[]; total: number }> {
  const { data } = await responseHandle<{ data: PaymentTerm[]; total: number }>(
    () =>
      supabase.rpc('mdm_payment_terms_list_secure', {
        p_keyword: params.keyword || '',
        p_limit: params.size,
        p_offset: (params.current - 1) * params.size
      }),
    options
  )
  if (!data || !Array.isArray(data.data)) throw new Error('付款条件加载失败，请重试')
  return data
}

export async function savePaymentTerm(term: Partial<PaymentTerm>): Promise<void> {
  await responseHandle(
    () => supabase.rpc('mdm_save_payment_term_secure', { p_term: keysToSnakeDeep(term) }),
    options
  )
}
