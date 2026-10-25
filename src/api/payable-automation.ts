import { useSupabase } from '@/hooks/core/useSupabase'
import type { MasterDataDeleteDependencyDetail } from '@/api/master-data-delete'
import type { PayableReference } from '@/api/payable-reference'
import type { PayableCrossCurrencyMode, PayableWriteoffRelation } from '@/api/payable-writeoff'

export type PayableAutomationRelation = PayableWriteoffRelation | 'payable_refund'
export interface PayableAutomationConfiguration {
  id: string
  tenantId: string
  schemeId: string
  accountSetId: string
  name: string
  enabled: boolean
  relations: PayableAutomationRelation[]
  allowCrossParty: boolean
  crossCurrencyMode: PayableCrossCurrencyMode
  schemeVersion: number
  version: number
  pauseReason: string
  schemeName: string
  accountSetName: string
  actorName: string
  jobCount: number
}
export interface PayableAutomationJob {
  id: string
  tenantId: string
  automationId: string
  automationName: string
  automationVersion: number
  configurationVersion: number
  configurationEnabled: boolean
  schemeVersion: number
  jobNo: string
  relation: PayableAutomationRelation
  sourceDocumentNo: string
  businessDate: string
  status: 'pending' | 'blocked' | 'failed' | 'no_match' | 'succeeded' | 'cancelled'
  message: string
  attemptCount: number
  recordCount: number
  actorName: string
}
export interface PayableAutomationQuery {
  configurationPage?: number
  jobPage?: number
  size?: number
  tenantId?: string | null
  automationId?: string
  jobId?: string
  keyword?: string
  status?: string
}
export interface PayableAutomationWorkspace {
  configurationVersion: number
  configurations: { data: PayableAutomationConfiguration[]; total: number }
  jobs: { data: PayableAutomationJob[]; total: number }
  books: Array<{ id: string; tenantId: string; name: string; code: string; active: boolean }>
  schemes: Array<PayableReference & { id: string; tenantId: string; version: number }>
  runtime: { available: boolean }
  relations: Array<{ label: string; value: PayableAutomationRelation }>
}
export interface PayableAutomationInput {
  id?: string
  version?: number
  schemeId: string
  expectedSchemeVersion: number
  accountSetId: string
  name: string
  enabled: boolean
  relations: PayableAutomationRelation[]
  allowCrossParty: boolean
  crossCurrencyMode: PayableCrossCurrencyMode
  processExisting: boolean
}
export interface PayableAutomationRecord {
  id: string
  recordNo: string
  documentNo: string | null
  status: string
  writeoffDate: string
  needsVoucher: boolean
  voucherNo: string | null
}
const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const options = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '后台核销操作失败，请重试'
}

export async function fetchPayableAutomationWorkspace(
  query: PayableAutomationQuery
): Promise<PayableAutomationWorkspace> {
  const { data } = await responseHandle<PayableAutomationWorkspace>(
    () =>
      supabase.rpc('fms_payable_automation_workspace_secure', {
        p_query: keysToSnakeDeep({ ...query, clientVersion: 2 })
      }),
    options
  )
  if (
    !data ||
    data.configurationVersion !== 1 ||
    !Array.isArray(data.configurations?.data) ||
    !Array.isArray(data.jobs?.data) ||
    !Array.isArray(data.books) ||
    !Array.isArray(data.schemes) ||
    !Array.isArray(data.relations) ||
    typeof data.runtime?.available !== 'boolean'
  ) {
    throw new Error('后台核销资料不完整或版本已变化，请刷新后重试')
  }
  return data
}
export async function savePayableAutomation(input: PayableAutomationInput): Promise<string> {
  const { data } = await responseHandle<string>(
    () =>
      supabase.rpc('fms_save_payable_automation_secure', {
        p_record: keysToSnakeDeep({ ...input, configurationVersion: 1 })
      }),
    options
  )
  if (typeof data !== 'string' || !data) throw new Error('后台核销配置未保存，请重试')
  return data
}
export async function fetchPayableAutomationDeleteDependencies(
  ids: string[]
): Promise<MasterDataDeleteDependencyDetail[]> {
  const { data } = await responseHandle<MasterDataDeleteDependencyDetail[]>(
    () => supabase.rpc('get_fms_payable_automation_delete_dependencies_secure', { p_ids: ids }),
    options
  )
  if (!Array.isArray(data)) throw new Error('后台核销关联检查失败，请重新检查后再删除')
  return data
}
export async function deletePayableAutomation(id: string, version: number): Promise<void> {
  const { data } = await responseHandle<boolean>(
    () =>
      supabase.rpc('fms_delete_payable_automation_secure', {
        p_id: id,
        p_expected_version: version
      }),
    options
  )
  if (data !== true) throw new Error('后台核销配置未删除，请刷新后核对')
}
export async function retryPayableAutomationJob(id: string): Promise<void> {
  const { data } = await responseHandle<string>(
    () => supabase.rpc('fms_retry_payable_automation_job_secure', { p_id: id }),
    options
  )
  if (data !== id) throw new Error('后台核销任务未重新排队，请刷新后核对')
}
export async function fetchPayableAutomationRecords(
  jobId: string,
  page = 1,
  size = 20
): Promise<{ data: PayableAutomationRecord[]; total: number }> {
  const { data } = await responseHandle<{ data: PayableAutomationRecord[]; total: number }>(
    () =>
      supabase.rpc('fms_payable_automation_records_secure', {
        p_job_id: jobId,
        p_page: page,
        p_size: size
      }),
    options
  )
  if (!data || !Array.isArray(data.data) || !Number.isSafeInteger(data.total) || data.total < 0)
    throw new Error('后台核销记录未加载，请重试')
  return data
}
