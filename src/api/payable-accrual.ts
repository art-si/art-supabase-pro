import { useSupabase } from '@/hooks/core/useSupabase'
import type { MasterDataDeleteDependencyDetail } from '@/api/master-data-delete'
import { normalizeNonNullableText } from '@/utils/form/normalize'
import { createTenantScopeReadGuard } from '@/utils/tenant-scope-context'
import { fetchOrganizationOptionsTree } from '@/api/system-manage'
import {
  buildOrganizationSelectTree,
  type OrganizationSelectOption
} from '@/utils/organization-options'

interface AccrualOption {
  id: string
  tenantId: string
  code: string
  name: string
}
export interface PayableAccrualPolicy {
  id: string
  tenantId: string
  code: string
  name: string
  organizationId: string
  organizationName: string
  accountSetId: string
  accountSetName: string
  effectiveFrom: string
  enabled: boolean
  autoApprove: boolean
  taxExcludedFromCost: boolean
  version: number
  actorName: string
  generatedCount: number
  locked: boolean
  remark: string
}
export interface PayableAccrualGap {
  id: string
  tenantId: string
  policyId: string
  sourceDocumentId: string
  sourceDocumentNo: string
  businessDate: string
  lineNo: number
  materialDescription: string
  quantity: number
  recognizedQuantity: number
  differenceQuantity: number
  pendingDocumentCount: number
}
export interface PayableAccrualWorkspace {
  configurations: { data: PayableAccrualPolicy[]; total: number }
  gaps: { data: PayableAccrualGap[]; total: number }
  organizations: OrganizationSelectOption[]
  books: AccrualOption[]
  periods: Array<{
    id: string
    tenantId: string
    accountSetId: string
    endDate: string
    name: string
  }>
  actorName: string | null
  canAutoApprove: boolean
  canReadSources: boolean
}
export interface PayableAccrualInput {
  id?: string
  version?: number
  code: string
  name: string
  organizationId: string
  accountSetId: string
  effectiveFrom: string
  enabled: boolean
  autoApprove: boolean
  taxExcludedFromCost: boolean
  remark: string
}
const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const options = {
  breakReturn: true,
  showErrorMessage: false,
  showReferenceFeedback: false,
  errorMessage: '自动暂估操作失败，请刷新后重试'
}

export async function fetchPayableAccrualWorkspace(query: {
  current: number
  size: number
  keyword?: string
  periodId?: string
}): Promise<PayableAccrualWorkspace> {
  const assertScope = createTenantScopeReadGuard()
  const { data } = await responseHandle<
    Omit<PayableAccrualWorkspace, 'organizations'> & { organizations: AccrualOption[] }
  >(
    () => supabase.rpc('fms_payable_accrual_workspace_secure', { p_query: keysToSnakeDeep(query) }),
    options
  )
  if (
    !data ||
    !Array.isArray(data.configurations?.data) ||
    !Number.isSafeInteger(data.configurations.total) ||
    data.configurations.total < 0 ||
    !Array.isArray(data.gaps?.data) ||
    !Number.isSafeInteger(data.gaps.total) ||
    data.gaps.total < 0 ||
    !Array.isArray(data.organizations) ||
    !Array.isArray(data.books) ||
    !Array.isArray(data.periods) ||
    typeof data.canAutoApprove !== 'boolean' ||
    typeof data.canReadSources !== 'boolean'
  ) {
    throw new Error('自动暂估资料不完整，请刷新后重试')
  }
  const tree = await fetchOrganizationOptionsTree({}, { showErrorMessage: false })
  assertScope()
  if (tree.error) throw tree.error
  return {
    ...data,
    organizations: buildOrganizationSelectTree(tree.data ?? [], data.organizations)
  }
}

export async function savePayableAccrualPolicy(input: PayableAccrualInput): Promise<string> {
  const { data } = await responseHandle<string>(
    () =>
      supabase.rpc('fms_save_payable_accrual_policy_secure', {
        p_policy: keysToSnakeDeep({
          ...input,
          code: normalizeNonNullableText(input.code),
          name: normalizeNonNullableText(input.name),
          remark: normalizeNonNullableText(input.remark)
        })
      }),
    options
  )
  if (typeof data !== 'string' || !data) throw new Error('自动暂估参数未保存，请重试')
  return data
}

export async function fetchPayableAccrualDeleteDependencies(
  ids: string[]
): Promise<MasterDataDeleteDependencyDetail[]> {
  const assertScope = createTenantScopeReadGuard()
  const { data } = await responseHandle<MasterDataDeleteDependencyDetail[]>(
    () => supabase.rpc('fms_payable_accrual_delete_dependencies_secure', { p_ids: ids }),
    options
  )
  assertScope()
  if (!Array.isArray(data)) throw new Error('自动暂估关联检查失败，请重新检查后再删除')
  return data
}

export async function deletePayableAccrualPolicy(id: string): Promise<void> {
  await responseHandle(
    () => supabase.rpc('fms_delete_payable_accrual_policy_secure', { p_id: id }),
    options
  )
}

export async function executePayableAccrual(sourceDocumentId: string): Promise<string[]> {
  const { data } = await responseHandle<{ documentIds: string[] }>(
    () =>
      supabase.rpc('fms_execute_payable_accrual_secure', {
        p_source_document_id: sourceDocumentId
      }),
    options
  )
  if (
    !data ||
    !Array.isArray(data.documentIds) ||
    data.documentIds.some((id) => typeof id !== 'string')
  )
    throw new Error('补提结果不完整，请查询原入库关联暂估单后重试')
  return data.documentIds
}
