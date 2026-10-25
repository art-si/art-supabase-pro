import { useSupabase } from '@/hooks/core/useSupabase'
import { fetchOrganizationOptionsTree } from '@/api/system-manage'
import { buildOrganizationSelectTree } from '@/utils/organization-options'
import type { OrganizationSelectOption } from '@/utils/organization-options'

export type PayableReportMode = 'summary' | 'detail' | 'aging'
export type PayableReportAction = 'view' | 'export' | 'print'
export type PayableBalanceState =
  'ready' | 'amount_hidden' | 'source_mismatch' | 'history_incomplete'

export interface PayableReportQuery {
  current: number
  size: number
  mode: PayableReportMode
  action?: PayableReportAction
  asOfDate: string
  agingBasis: 'business' | 'due'
  allocationMode: 'oldest_due' | 'proportional'
  kind?: '' | 'estimated' | 'financial'
  tenantId?: string
  accountSetId?: string
  organizationId?: string
  partyType?: '' | 'supplier' | 'carrier'
  partyId?: string
  currencyCode?: string
  keyword?: string
  outstandingOnly?: boolean
}

export interface PayableReportRow {
  id: string
  tenantId: string
  tenantName: string
  accountSetName: string
  organizationName: string
  partyName: string
  partyCode: string
  partyType: 'supplier' | 'carrier'
  kind: 'estimated' | 'financial'
  currencyCode: string
  baseCurrencyCode: string
  documentNo?: string
  sourceDocumentNo?: string
  businessDate?: string
  dueDate?: string | null
  documentCount: number
  amountReadable: boolean
  balanceState: PayableBalanceState
  occurrenceAmount: number | null
  reductionAmount: number | null
  balanceAmount: number | null
  baseBalanceAmount: number | null
  currentAmount: number | null
  age1To30: number | null
  age31To60: number | null
  age61To90: number | null
  age91To180: number | null
  ageOver180: number | null
  creditBalance: number | null
}

interface ReportOption {
  id: string
  tenantId: string
  name: string
  code: string
}

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const options = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '应付报表加载失败，请重试'
}

export async function fetchPayableReportOptions(): Promise<{
  books: ReportOption[]
  organizations: OrganizationSelectOption[]
}> {
  const { data } = await responseHandle<{
    books: ReportOption[]
    organizations: ReportOption[]
  }>(() => supabase.rpc('fms_payable_report_options_secure'), options)
  if (!data || !Array.isArray(data.books) || !Array.isArray(data.organizations)) {
    throw new Error('应付报表筛选资料不完整，请重试')
  }
  const tree = await fetchOrganizationOptionsTree({}, { showErrorMessage: false })
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
  const { data } = await responseHandle<{
    records: PayableReportRow[]
    total: number
    unavailableCount: number
  }>(() => supabase.rpc('fms_payable_report_secure', { p_query: keysToSnakeDeep(query) }), options)
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
