import { useSupabase } from '@/hooks/core/useSupabase'
import { buildSupabaseRpcRange } from '@/utils/supabase/pagination'
import { parseOrderMainlineCosts, type OrderMainlineCostRecord } from './order-mainline-costs.model'
import type { MainlinePage } from './mainline-operating.model'

export type { OrderMainlineCostRecord } from './order-mainline-costs.model'

const { supabase, responseHandle } = useSupabase()

export async function fetchOrderMainlineCosts(query: {
  orderId: string
  from?: number
  to?: number
}): Promise<MainlinePage<OrderMainlineCostRecord>> {
  if (!query.orderId) throw new Error('缺少订单标识，请返回列表重新选择')
  const from = query.from ?? 0
  const to = query.to ?? from + 19
  if (
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(to) ||
    from < 0 ||
    to < from ||
    to - from > 99
  ) {
    throw new Error('分页参数不正确，请刷新后重试')
  }
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('tms_list_order_mainline_costs_secure', {
        p_order_id: query.orderId,
        ...buildSupabaseRpcRange(from, to)
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '订单费用明细加载失败，请重试'
    }
  )
  return parseOrderMainlineCosts(result.data)
}
