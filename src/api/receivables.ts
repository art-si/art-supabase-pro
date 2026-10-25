import { useSupabase } from '@/hooks/core/useSupabase'
import { pick } from 'lodash-es'
import { fetchOrganizationOptionsTree } from '@/api/system-manage'
import { buildOrganizationSelectTree } from '@/utils/organization-options'
import { normalizeNullableText, normalizeNonNullableText } from '@/utils/form/normalize'
import type { MasterDataDeleteDependencyDetail } from '@/api/master-data-delete'
import type {
  ArWorkspaceKind,
  ArQuery,
  ArOption,
  ReceiptDocument,
  RevenueCostDocument,
  WriteoffPayload,
  WriteoffCandidate,
  WriteoffRecord,
  WriteoffCheckResult,
  ArAdjustment,
  ReceiptCondition,
  ArVoucherResult,
  ArPaymentRequest
} from './receivables.types'
export type * from './receivables.types'

export type ReceivableDocumentKind = 'estimate' | 'financial' | 'reversal'
export type ReceivableDocumentStatus = 'draft' | 'submitted' | 'approved'
export type ReceivableBasis = 'quantity' | 'amount'

export interface ReceivableLine {
  id: string
  tenantId: string
  documentId: string
  lineNo: number
  basis: ReceivableBasis
  estimatedLineId: string | null
  financialLineId: string | null
  sourceLineId: string | null
  sourceLineNo: string | null
  sourceTotalAmount: number | null
  materialId: string | null
  materialDescription: string
  specificationModel: string | null
  projectId: string | null
  inventoryUnitId: string | null
  baseUnitId: string | null
  quantity: number
  baseQuantity: number
  matchedQuantity: number
  matchedAmount: number
  unitPrice: number
  taxInclusiveUnitPrice: number
  taxRate: number | null
  discountMethod: 'none' | 'rate' | 'amount'
  discountRate: number
  discountAmount: number
  amount: number | null
  taxAmount: number | null
  totalAmount: number | null
  gift: boolean
  advanceInvoice: boolean
  customerId: string | null
  contractId: string | null
  expenseDepartmentId: string | null
  settlementLineMark: string | null
  remark: string | null
  materialCode?: string
  projectName?: string
  projectCode?: string
  inventoryUnitName?: string
  baseUnitName?: string
  availableAmount?: number | null
  outstandingAmount?: number | null
  linkedFinancialAmount?: number | null
  reversedAmount?: number | null
  linkedQuantity?: number
  reversedQuantity?: number
  warrantyAmount?: number
}

export interface ReceivableDocument {
  id: string
  tenantId: string
  documentNo: string
  kind: ReceivableDocumentKind
  status: ReceivableDocumentStatus
  documentTypeId: string | null
  estimateId: string | null
  financialId: string | null
  sourceType: string | null
  sourceId: string | null
  sourceNo: string | null
  isInitialization: boolean
  customerId: string
  payerCustomerId: string | null
  settlementOrganizationId: string | null
  projectId: string | null
  requestDepartmentId: string | null
  businessDate: string
  accountingDate: string
  currencyCode: string
  paymentTermId: string | null
  settlementMethod: string
  amount: number | null
  taxAmount: number | null
  totalAmount: number | null
  remark: string | null
  voucherId: string | null
  submittedAt: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
  customer?: { customerName: string } | null
  lines?: ReceivableLine[]
  customerName?: string
  organizationName?: string
  projectName?: string
  documentTypeName?: string
  paymentTermName?: string
  voucherNo?: string
  createdBy?: string
  isCredit?: boolean
  dueDate?: string
  inputTaxInclusivePrice?: boolean
  inputAmount?: boolean
  discountIncludesTax?: boolean
  linkedFinancialAmount?: number | null
  unlinkedFinancialAmount?: number | null
  reversedAmount?: number | null
  unreversedAmount?: number | null
  appliedAmount?: number | null
  outstandingAmount?: number | null
  reservedAmount?: number | null
  availableAmount?: number | null
  invoicedAmount?: number | null
  uninvoicedAmount?: number | null
  unlinkedInvoiceAmount?: number | null
  unmatchedAmount?: number | null
  accountingStatus?: 'none' | 'partial' | 'full'
  requestDepartmentName?: string
  recordKey?: string
}

export interface ReceivableWriteLine {
  lineNo: number
  basis: ReceivableBasis
  estimatedLineId?: string | null
  sourceLineId?: string | null
  sourceLineNo?: string | null
  sourceTotalAmount?: number | null
  materialId?: string | null
  materialDescription: string
  projectId?: string | null
  inventoryUnitId?: string | null
  baseUnitId?: string | null
  quantity: number
  baseQuantity?: number
  matchedQuantity?: number
  matchedAmount?: number
  priceBasis: 'untaxed' | 'taxed'
  unitPrice: number
  taxInclusiveUnitPrice: number
  taxRate: number | null
  discountMethod: 'none' | 'rate' | 'amount'
  discountRate: number
  discountAmount: number
  enteredGrossAmount?: number | null
  gift: boolean
  advanceInvoice?: boolean
  customerId?: string | null
  contractId?: string | null
  expenseDepartmentId?: string | null
  settlementLineMark?: string | null
  remark?: string | null
  warrantyAmount?: number
}

export interface ReceivableWritePayload {
  requestId?: string
  id?: string
  kind: 'estimate' | 'financial'
  tenantId?: string | null
  documentTypeId: string
  estimateId?: string | null
  customerId: string
  payerCustomerId?: string | null
  settlementOrganizationId?: string | null
  projectId?: string | null
  requestDepartmentId?: string | null
  businessDate: string
  currencyCode: string
  paymentTermId?: string | null
  settlementMethod: string
  remark?: string | null
  lines: ReceivableWriteLine[]
  isCredit?: boolean
  inputTaxInclusivePrice?: boolean
  inputAmount?: boolean
  discountIncludesTax?: boolean
}

const { supabase, responseHandle } = useSupabase()

export async function saveReceivableDocument(payload: ReceivableWritePayload): Promise<string> {
  const writePayload = {
    ...pick(payload, [
      'id',
      'requestId',
      'kind',
      'tenantId',
      'documentTypeId',
      'estimateId',
      'customerId',
      'payerCustomerId',
      'settlementOrganizationId',
      'projectId',
      'requestDepartmentId',
      'businessDate',
      'currencyCode',
      'paymentTermId',
      'settlementMethod',
      'isCredit',
      'inputTaxInclusivePrice',
      'inputAmount',
      'discountIncludesTax'
    ]),
    remark: normalizeNullableText(payload.remark),
    lines: payload.lines.map((line) => ({
      ...pick(line, [
        'lineNo',
        'basis',
        'estimatedLineId',
        'sourceLineId',
        'sourceLineNo',
        'sourceTotalAmount',
        'materialId',
        'projectId',
        'inventoryUnitId',
        'baseUnitId',
        'quantity',
        'baseQuantity',
        'matchedQuantity',
        'matchedAmount',
        'priceBasis',
        'unitPrice',
        'taxInclusiveUnitPrice',
        'taxRate',
        'discountMethod',
        'discountRate',
        'discountAmount',
        'enteredGrossAmount',
        'gift',
        'advanceInvoice',
        'customerId',
        'contractId',
        'expenseDepartmentId',
        'warrantyAmount'
      ]),
      materialDescription: normalizeNonNullableText(line.materialDescription),
      settlementLineMark: normalizeNullableText(line.settlementLineMark),
      remark: normalizeNullableText(line.remark)
    }))
  }
  const result = await responseHandle<string>(
    () => supabase.rpc('fms_save_receivable_document_secure', { p_payload: writePayload }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
  if (!result.data) throw new Error('应收单据保存失败，请重试')
  return result.data
}

export async function createEstimatedReceivableFromSource(
  sourceType: 'wms_sales_outbound' | 'tms_signed_waybill',
  sourceId: string
): Promise<string> {
  const result = await responseHandle<string>(
    () =>
      supabase.rpc('fms_create_estimated_receivable_from_source_secure', {
        p_source_type: sourceType,
        p_source_id: sourceId
      }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
  if (!result.data) throw new Error('暂估应收单生成失败，请重试')
  return result.data
}

export async function createTransportEstimatedReceivables(waybillId: string): Promise<string[]> {
  const result = await responseHandle<string[]>(
    () =>
      supabase.rpc('fms_create_transport_estimated_receivables_secure', {
        p_waybill_id: waybillId
      }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
  if (!result.data?.length) throw new Error('暂估应收单生成失败，请重试')
  return result.data
}

export async function pushFinancialReceivable(estimateId: string): Promise<string> {
  const result = await responseHandle<string>(
    () => supabase.rpc('fms_push_financial_receivable_secure', { p_estimate_id: estimateId }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
  if (!result.data) throw new Error('财务应收单生成失败，请重试')
  return result.data
}

export async function actReceivableDocument(
  id: string,
  action: 'submit' | 'approve' | 'delete'
): Promise<void> {
  const result = await responseHandle(
    () => supabase.rpc('fms_act_receivable_document_secure', { p_id: id, p_action: action }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
}

interface ArWorkspaceRecords {
  estimate: ReceivableDocument
  financial: ReceivableDocument
  receipt: ReceiptDocument
  refund: ReceiptDocument
  revenue: RevenueCostDocument
  writeoff: WriteoffRecord
  adjustment: ArAdjustment
  condition: ReceiptCondition
  payment_request: ArPaymentRequest
}

export async function fetchArWorkspace<K extends ArWorkspaceKind>(
  kind: K,
  query: ArQuery = {}
): Promise<{ data: ArWorkspaceRecords[K][]; total: number }> {
  const result = await responseHandle<{ records: ArWorkspaceRecords[K][]; total: number }>(
    () => supabase.rpc('fms_receivable_workspace_secure', { p_kind: kind, p_query: query }),
    { showErrorMessage: false, errorMessage: '应收资料加载失败，请重试' }
  )
  if (result.error) throw result.error
  if (!result.data || !Array.isArray(result.data.records) || !Number.isFinite(result.data.total)) {
    throw new Error('应收资料返回不完整，请刷新后重试')
  }
  return { data: result.data.records, total: result.data.total }
}

export async function fetchArOptions(
  type: string,
  tenantId?: string | null,
  keyword = ''
): Promise<ArOption[]> {
  const result = await responseHandle<ArOption[]>(
    () =>
      supabase.rpc('fms_ar_options_secure', {
        p_type: type,
        p_tenant_id: tenantId || null,
        p_keyword: keyword
      }),
    { showErrorMessage: false, errorMessage: '参选资料加载失败，请重试' }
  )
  if (result.error) throw result.error
  if (!Array.isArray(result.data)) throw new Error('参选资料返回不完整，请重试')
  return result.data.filter((row) => typeof row.id === 'string' && typeof row.name === 'string')
}

export interface ArOrganizationOption extends ArOption {
  disabled: boolean
  children?: ArOrganizationOption[]
}

/** Preserve the receivables permission/default/initialization rules within the organization hierarchy. */
export async function fetchArOrganizationTree(
  type: 'organization' | 'company' | 'initialized_organization',
  tenantId?: string | null
): Promise<ArOrganizationOption[]> {
  const [allowed, response] = await Promise.all([
    fetchArOptions(type, tenantId),
    fetchOrganizationOptionsTree({ tenantId: tenantId ?? undefined }, { showErrorMessage: false })
  ])
  if (response.error) throw response.error
  return buildOrganizationSelectTree(response.data ?? [], allowed)
}

export async function saveArReceipt(payload: Partial<ReceiptDocument>): Promise<string> {
  const result = await responseHandle<string>(
    () =>
      supabase.rpc('fms_save_receipt_secure', {
        p_payload: {
          ...pick(payload, [
            'id',
            'requestId',
            'tenantId',
            'customerId',
            'settlementOrganizationId',
            'businessDate',
            'currencyCode',
            'paymentMethod',
            'fundAccountId',
            'cashTransactionId',
            'matchingReference',
            'lines'
          ]),
          id: payload.id || null,
          bankReference: normalizeNullableText(payload.bankReference),
          remark: normalizeNullableText(payload.remark)
        }
      }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
  if (!result.data) throw new Error('收款单未保存，请重试')
  return result.data
}

export async function saveArRefund(payload: {
  requestId?: string
  originalReceiptId: string
  amount: number
  businessDate: string
  remark: string
}): Promise<string> {
  const result = await responseHandle<string>(
    () => supabase.rpc('fms_save_receivable_refund_secure', { p_payload: payload }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
  if (!result.data) throw new Error('退款单未保存，请重试')
  return result.data
}

export async function actArDocument(
  kind: 'receipt' | 'refund' | 'revenue',
  id: string,
  action: string
): Promise<void> {
  const rpc = {
    receipt: 'fms_act_receipt_secure',
    refund: 'fms_act_receivable_refund_secure',
    revenue: 'fms_act_revenue_cost_secure'
  }[kind]
  const result = await responseHandle(() => supabase.rpc(rpc, { p_id: id, p_action: action }), {
    showErrorMessage: false
  })
  if (result.error) throw result.error
}

export async function actArPaymentRequest(
  id: string,
  action: 'submit' | 'approve' | 'pay' | 'delete'
): Promise<void> {
  const result = await responseHandle(
    () => supabase.rpc('fms_act_receivable_payment_request_secure', { p_id: id, p_action: action }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
}

export async function createArCreditPaymentRequest(
  financialId: string,
  payload: {
    requestId: string
    amount: number
    businessDate: string
    fundAccountId: string
    paymentMethod: string
    remark: string
  }
): Promise<string> {
  const result = await responseHandle<string>(
    () =>
      supabase.rpc('fms_create_credit_payment_request_secure', {
        p_financial_id: financialId,
        p_payload: payload
      }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
  if (!result.data) throw new Error('付款申请未生成，请重试')
  return result.data
}

export async function createArRefundPaymentRequest(refundId: string): Promise<string> {
  const result = await responseHandle<string>(
    () => supabase.rpc('fms_act_receivable_refund_secure', { p_id: refundId, p_action: 'request' }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
  if (!result.data) throw new Error('付款申请未生成，请重试')
  return result.data
}

export async function pushArRevenueCost(id: string): Promise<string> {
  const result = await responseHandle<string>(
    () => supabase.rpc('fms_push_revenue_cost_secure', { p_estimate_id: id }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
  if (!result.data) throw new Error('收入成本确认单未生成，请重试')
  return result.data
}

export async function pushArInvoice(id: string, type: 'ordinary' | 'special'): Promise<string[]> {
  const result = await responseHandle<string[]>(
    () => supabase.rpc('fms_push_receivable_invoice_secure', { p_id: id, p_type: type }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
  if (!Array.isArray(result.data)) throw new Error('发票草稿未生成，请重试')
  return result.data
}

export async function arVoucher(
  kind: string,
  id: string,
  generate = false
): Promise<ArVoucherResult> {
  const result = await responseHandle<ArVoucherResult>(
    () => supabase.rpc('fms_ar_voucher_secure', { p_kind: kind, p_id: id, p_generate: generate }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
  if (!result.data || typeof result.data.message !== 'string')
    throw new Error('凭证资料未返回，请重试')
  return result.data
}

export async function cancelSupplierReceipt(id: string, reason: string): Promise<void> {
  const result = await responseHandle(
    () => supabase.rpc('fms_cancel_supplier_receipt_secure', { p_id: id, p_reason: reason }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
}

export async function fetchArDeleteDependencies(
  kind: string,
  ids: string[]
): Promise<MasterDataDeleteDependencyDetail[]> {
  const result = await responseHandle<MasterDataDeleteDependencyDetail[]>(
    () => supabase.rpc('fms_ar_delete_dependencies_secure', { p_kind: kind, p_ids: ids }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
  if (!Array.isArray(result.data)) throw new Error('关联资料核验失败，请重试')
  return result.data
}

export async function fetchArWriteoffCandidates(query: {
  organizationId: string
  customerId?: string
  counterpartyType: string
}): Promise<{
  data: WriteoffCandidate[]
  summary: {
    receivableAmount: number
    dueThisMonthAmount: number
    unallocatedReceiptAmount: number
  }
}> {
  const result = await responseHandle<{
    records: WriteoffCandidate[]
    summary: {
      receivableAmount: number
      dueThisMonthAmount: number
      unallocatedReceiptAmount: number
    }
  }>(() => supabase.rpc('fms_receivable_writeoff_candidates_secure', { p_query: query }), {
    showErrorMessage: false
  })
  if (result.error) throw result.error
  if (!result.data || !Array.isArray(result.data.records))
    throw new Error('可核销资料未加载，请重试')
  return {
    data: result.data.records.map((row) => ({
      ...row,
      writeoffAmount: row.availableAmount,
      remark: ''
    })),
    summary: result.data.summary
  }
}

export async function executeArWriteoff(payload: WriteoffPayload): Promise<string> {
  const result = await responseHandle<string>(
    () =>
      supabase.rpc('fms_execute_receivable_writeoff_secure', {
        p_payload: {
          ...pick(payload, [
            'requestId',
            'relationKind',
            'writeoffDate',
            'organizationId',
            'schemeId',
            'crossCustomer',
            'crossCurrency'
          ]),
          reason: normalizeNonNullableText(payload.reason),
          sides: payload.sides.map((side) =>
            pick(side, ['id', 'sourceType', 'side', 'amount', 'remark'])
          )
        }
      }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
  if (!result.data) throw new Error('核销未完成，请重试')
  return result.data
}

export async function checkArWriteoff(payload: WriteoffPayload): Promise<WriteoffCheckResult[]> {
  const result = await responseHandle<WriteoffCheckResult[]>(
    () => supabase.rpc('fms_check_receivable_writeoff_secure', { p_payload: payload }),
    {
      showErrorMessage: false
    }
  )
  if (result.error) throw result.error
  if (!Array.isArray(result.data)) throw new Error('单据查验未完成，请重试')
  return result.data
}

export async function reverseArWriteoff(id: string, reason: string): Promise<void> {
  const result = await responseHandle(
    () => supabase.rpc('fms_reverse_receivable_writeoff_secure', { p_id: id, p_reason: reason }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
}

export async function saveArAdjustment(payload: {
  requestId?: string
  financialLineId: string
  kind: string
  amount: number
  businessDate: string
  reason: string
}): Promise<void> {
  const result = await responseHandle(
    () => supabase.rpc('fms_save_receivable_adjustment_secure', { p_payload: payload }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
}

export async function actArAdjustment(id: string, action: 'submit' | 'approve'): Promise<void> {
  const result = await responseHandle(
    () => supabase.rpc('fms_act_receivable_adjustment_secure', { p_id: id, p_action: action }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
}

export async function saveArCondition(
  payload: Partial<ReceiptCondition> & { code: string }
): Promise<void> {
  const result = await responseHandle(
    () =>
      supabase.rpc('fms_save_receipt_condition_secure', {
        p_payload: { ...payload, id: payload.id || null }
      }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
}

export async function deleteArRecords(kind: ArWorkspaceKind, ids: string[]): Promise<void> {
  const result = await responseHandle(
    () => supabase.rpc('fms_delete_ar_records_secure', { p_kind: kind, p_ids: ids }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
}

export async function matchAdvanceReceivable(
  financialId: string,
  estimateId: string,
  lines: Array<{
    financialLineId: string
    estimatedLineId: string
    quantity: number
    amount: number
  }>
): Promise<void> {
  const result = await responseHandle(
    () =>
      supabase.rpc('fms_match_advance_receivable_secure', {
        p_financial_id: financialId,
        p_estimate_id: estimateId,
        p_lines: lines
      }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
}

export async function saveArScheme(payload: {
  name: string
  sameCustomer: boolean
  sameCurrency: boolean
  sameProject: boolean
  sameSource: boolean
}): Promise<void> {
  const result = await responseHandle(
    () => supabase.rpc('fms_save_ar_scheme_secure', { p_payload: payload }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
}

export async function fetchArReport(
  query: ArQuery & { mode?: string; asOfDate?: string; agingBasis?: string; kind?: string }
): Promise<{ data: import('./receivables.types').ArReportRow[]; total: number }> {
  const result = await responseHandle<{
    records: import('./receivables.types').ArReportRow[]
    total: number
  }>(() => supabase.rpc('fms_ar_report_secure', { p_query: query }), { showErrorMessage: false })
  if (result.error) throw result.error
  if (!result.data || !Array.isArray(result.data.records)) throw new Error('应收报表未加载，请重试')
  return { data: result.data.records, total: result.data.total }
}
