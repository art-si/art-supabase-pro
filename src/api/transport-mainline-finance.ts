import { useSupabase } from '@/hooks/core/useSupabase'
import {
  parseOrderMainlineFinance,
  type OrderMainlineFinance
} from './transport-mainline-finance.model'
export type {
  OrderMainlineFinance,
  OrderMainlineException,
  OrderStatementLine
} from './transport-mainline-finance.model'

const { supabase, responseHandle } = useSupabase()

export async function fetchOrderMainlineFinance(
  orderId: string
): Promise<OrderMainlineFinance | null> {
  const result = await responseHandle<unknown>(
    () => supabase.rpc('tms_get_order_mainline_finance_secure', { p_order_id: orderId }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '订单对账与异常信息加载失败，请重试'
    }
  )
  return parseOrderMainlineFinance(result.data)
}
