import { useSupabase } from '@/hooks/core/useSupabase'
import { buildSupabaseRpcRange } from '@/utils/supabase/pagination'
import { fetchMainlineCosts } from './mainline-operating'
import {
  parseDriverFinancePage,
  type DriverFinanceKind,
  type DriverFinancePage
} from './driver-finance.model'

export type {
  DriverFinanceKind,
  DriverFinancePage,
  DriverFinanceRecord
} from './driver-finance.model'

const { supabase, responseHandle } = useSupabase()

export async function listDriverFinanceRecords(query: {
  driverId: string
  kind: DriverFinanceKind
  page?: number
  pageSize?: number
}): Promise<DriverFinancePage> {
  if (!query.driverId) throw new Error('缺少司机标识，请返回列表重新选择')
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    throw new Error('分页参数不正确，请刷新后重试')
  }
  const from = (page - 1) * pageSize
  if (!Number.isSafeInteger(from)) throw new Error('分页参数不正确，请刷新后重试')
  if (query.kind === 'waybill_cost') {
    const result = await fetchMainlineCosts({
      driverId: query.driverId,
      from,
      to: from + pageSize - 1
    })
    return {
      total: result.total,
      records: result.data.map((cost) => ({
        id: cost.id,
        kind: 'waybill_cost',
        no: cost.costNo,
        occurredOn: cost.occurredOn,
        status: cost.auditStatus,
        amount: cost.amount,
        waybillId: cost.waybillId,
        waybillNo: cost.waybillNoSnapshot,
        orderNo: cost.orderNoSnapshot,
        costType: cost.costType,
        reason: cost.expenseItemName,
        remark: null,
        relatedNo: null,
        settlementStatus: cost.settlementStatus
      }))
    }
  }
  if (!['loan', 'repayment', 'reimbursement'].includes(query.kind)) {
    throw new Error('费用类型不正确，请刷新后重试')
  }
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('tms_list_driver_finance_records_secure', {
        p_driver_id: query.driverId,
        p_kind: query.kind,
        ...buildSupabaseRpcRange(from, from + pageSize - 1)
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '司机费用明细加载失败，请重试' }
  )
  return parseDriverFinancePage(result.data, query.kind)
}
