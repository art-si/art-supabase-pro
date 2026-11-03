import { useSupabase } from '@/hooks/core/useSupabase'

/** Minimal, read-only projection for a customer workspace outside the finance application. */
export interface CustomerStatementLinkRecord {
  id: string
  customerId: string
  statementNo: string
  periodStart: string
  periodEnd: string
  status: string
  waybillCount: number
}

export async function fetchCustomerStatementLinks(customerId: string, from: number, to: number) {
  const { supabase, responseHandle } = useSupabase()
  const result = await responseHandle<{ records: CustomerStatementLinkRecord[]; total: number }>(
    () =>
      supabase.rpc('tms_list_customer_statements_secure', {
        p_customer_id: customerId,
        p_from: from,
        p_to: to,
        p_purpose: 'list'
      }),
    { showErrorMessage: true }
  )
  return { data: result.data?.records ?? [], total: result.data?.total ?? 0, error: result.error }
}
