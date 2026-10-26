import { useSupabase } from '@/hooks/core/useSupabase'
import { fetchOrganizationOptionsTree } from '@/api/system-manage'
import { buildOrganizationSelectTree } from '@/utils/organization-options'
import type { OrganizationSelectOption } from '@/utils/organization-options'
import { createTenantScopeReadGuard } from '@/utils/tenant-scope-context'
import type {
  PayableReportOption,
  PayableReportQuery,
  PayableReportRow
} from './payable-report.types'

export type * from './payable-report.types'

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const options = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '应付报表加载失败，请重试'
}

export async function fetchPayableReportOptions(): Promise<{
  books: PayableReportOption[]
  organizations: OrganizationSelectOption[]
}> {
  const assertScope = createTenantScopeReadGuard()
  const { data } = await responseHandle<{
    books: PayableReportOption[]
    organizations: PayableReportOption[]
  }>(() => supabase.rpc('fms_payable_report_options_secure'), options)
  if (!data || !Array.isArray(data.books) || !Array.isArray(data.organizations)) {
    throw new Error('应付报表筛选资料不完整，请重试')
  }
  const tree = await fetchOrganizationOptionsTree({}, { showErrorMessage: false })
  assertScope()
  if (tree.error) throw tree.error
  return {
    books: data.books,
    organizations: buildOrganizationSelectTree(tree.data ?? [], data.organizations)
  }
}

export async function fetchPayableReport(query: PayableReportQuery): Promise<{
  data: PayableReportRow[]
  total: number
  unavailableCount: number
}> {
  const assertScope = createTenantScopeReadGuard()
  const { data } = await responseHandle<{
    records: PayableReportRow[]
    total: number
    unavailableCount: number
  }>(() => supabase.rpc('fms_payable_report_secure', { p_query: keysToSnakeDeep(query) }), options)
  assertScope()
  if (
    !data ||
    !Array.isArray(data.records) ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0 ||
    !Number.isSafeInteger(data.unavailableCount) ||
    data.unavailableCount < 0
  ) {
    throw new Error('应付报表数据不完整，请重试')
  }
  return { data: data.records, total: data.total, unavailableCount: data.unavailableCount }
}
