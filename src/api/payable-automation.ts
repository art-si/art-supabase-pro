import { useSupabase } from '@/hooks/core/useSupabase'
import type { MasterDataDeleteDependencyDetail } from '@/api/master-data-delete'
import { createTenantScopeReadGuard } from '@/utils/tenant-scope-context'
import type {
  PayableAutomationInput,
  PayableAutomationQuery,
  PayableAutomationRecord,
  PayableAutomationWorkspace
} from './payable-automation.types'

export type * from './payable-automation.types'
const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const options = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '后台核销操作失败，请重试'
}

export async function fetchPayableAutomationWorkspace(
  query: PayableAutomationQuery
): Promise<PayableAutomationWorkspace> {
  const assertScope = createTenantScopeReadGuard()
  const { data } = await responseHandle<PayableAutomationWorkspace>(
    () =>
      supabase.rpc('fms_payable_automation_workspace_secure', {
        p_query: keysToSnakeDeep({ ...query, clientVersion: 2 })
      }),
    options
  )
  assertScope()
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
  const assertScope = createTenantScopeReadGuard()
  const { data } = await responseHandle<MasterDataDeleteDependencyDetail[]>(
    () => supabase.rpc('get_fms_payable_automation_delete_dependencies_secure', { p_ids: ids }),
    options
  )
  assertScope()
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
  const assertScope = createTenantScopeReadGuard()
  const { data } = await responseHandle<{ data: PayableAutomationRecord[]; total: number }>(
    () =>
      supabase.rpc('fms_payable_automation_records_secure', {
        p_job_id: jobId,
        p_page: page,
        p_size: size
      }),
    options
  )
  assertScope()
  if (!data || !Array.isArray(data.data) || !Number.isSafeInteger(data.total) || data.total < 0)
    throw new Error('后台核销记录未加载，请重试')
  return data
}
