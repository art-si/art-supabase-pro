import { buildSupabaseRpcRange } from '@/utils/supabase'
import { normalizeNullableText } from '@/utils/form/normalize'
import { useSupabase } from '@/hooks/core/useSupabase'
import type { RunQueryOptions } from '@/hooks/core/useSupabase'

/** 跨应用可依赖的员工只读数据契约。 */
export interface EmployeeIntegrationItem {
  id: string
  tenantId: string
  organizationId?: string | null
  employeeNo: string
  employeeName: string
  avatarUrl?: string | null
  jobTitle?: string | null
  employmentStatus: string
  gender?: string | null
  phone?: string | null
  email?: string | null
  organization?: {
    id: string
    organizationCode: string
    organizationName: string
  } | null
}

export interface EmployeeSelectorContractParams {
  tenantId?: string
  keyword?: string
  from?: number
  to?: number
}

interface EmployeeSelectorContractPayload {
  records?: EmployeeIntegrationItem[]
  total?: number
  fieldAccess?: Record<string, Api.Common.FieldAccessLevel>
}

export type EmployeeSelectorContractResult = {
  data: EmployeeIntegrationItem[]
  total: number
  error: unknown
  fieldAccess: Record<string, Api.Common.FieldAccessLevel>
}

const { supabase, responseHandle } = useSupabase()

interface EmployeeReference {
  id: string
  tenantId?: string
  code?: string | null
  name?: string | null
  jobTitle?: string | null
  organizationName?: string | null
}

/** Adapt a business-authorized reference endpoint without using the account-binding roster. */
export function createEmployeeReferenceSelector(
  fetchReferences: (
    tenantId: string
  ) => Promise<{ data?: EmployeeReference[] | null; error: unknown }>
): (params?: EmployeeSelectorContractParams) => Promise<EmployeeSelectorContractResult> {
  return async (params = {}) => {
    const tenantId = params.tenantId
    if (!tenantId) return { data: [], total: 0, error: null, fieldAccess: {} }
    const result = await fetchReferences(tenantId)
    const keyword = params.keyword?.trim().toLocaleLowerCase() ?? ''
    const records = (result.data ?? []).filter(
      (item) =>
        item.tenantId === tenantId &&
        (!keyword ||
          [item.name, item.code, item.jobTitle, item.organizationName].some((value) =>
            value?.toLocaleLowerCase().includes(keyword)
          ))
    )
    const from = Math.max(params.from ?? 0, 0)
    const to = Math.max(params.to ?? from + 9, from)
    return {
      data: records.slice(from, to + 1).map((item) => ({
        id: item.id,
        tenantId,
        employeeNo: item.code ?? '',
        employeeName: item.name ?? '未命名员工',
        jobTitle: item.jobTitle,
        employmentStatus: ''
      })),
      total: records.length,
      error: result.error,
      fieldAccess: {}
    }
  }
}

/**
 * 平台级员工只读契约。
 *
 * 调用方只依赖稳定 RPC/HTTP 形状，不引用 HR 的页面、provider 或业务类型。
 * 将来 HR 独立成服务时，只需替换本适配器。
 */
export async function fetchEmployeeSelectorList(
  params: EmployeeSelectorContractParams = {},
  options: Pick<RunQueryOptions, 'showErrorMessage'> = {}
): Promise<EmployeeSelectorContractResult> {
  const { tenantId, keyword, from = 0, to = 9 } = params
  const range = buildSupabaseRpcRange(from, to)
  const result = await responseHandle<EmployeeSelectorContractPayload>(
    () =>
      supabase.rpc('hr_list_employee_selector_secure', {
        ...range,
        p_tenant_id: tenantId || null,
        p_keyword: normalizeNullableText(keyword)
      }),
    { showErrorMessage: options.showErrorMessage ?? true }
  )

  return {
    data: result.data?.records ?? [],
    total: result.data?.total ?? 0,
    error: result.error,
    fieldAccess: result.data?.fieldAccess ?? {}
  }
}

/** Resolve existing business references under the table's RLS; includes historical employees. */
export async function fetchEmployeeReferencesByIds(
  tenantId: string,
  ids: string[]
): Promise<EmployeeIntegrationItem[]> {
  if (!tenantId || !ids.length) return []
  const { data } = await responseHandle<EmployeeIntegrationItem[]>(
    () =>
      supabase
        .from('mdm_employee')
        .select(
          'id,tenant_id,organization_id,employee_no,employee_name,job_title,employment_status,organization:mdm_organization(id,organization_code,organization_name)'
        )
        .eq('tenant_id', tenantId)
        .in('id', ids),
    { breakReturn: true, showErrorMessage: false, errorMessage: '人员资料加载失败，请重试' }
  )
  return data ?? []
}
