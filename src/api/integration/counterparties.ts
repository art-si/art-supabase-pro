import { normalizeNullableText } from '@/utils/form/normalize'
import { useSupabase } from '@/hooks/core/useSupabase'
import type { ApiRequestOptions } from '@/types/api/request'
import { withRequestOptions } from '@/api/providers/supabase/query'

/**
 * 平台级交易对手只读契约。
 *
 * FMS 等消费者只依赖稳定的最小字段 DTO；数据由 TMS 的租户隔离只读 RPC
 * 提供，不导入 TMS 前端源码，因此任一子应用都可以独立构建和部署。
 */
export interface CounterpartyCarrierOption {
  id: string
  carrierCode?: string
  companyName: string
  enabled?: boolean
  contactName?: string
  contactPhone?: string
  fieldAccess?: Record<string, string>
  isRecordOwner?: boolean
}

export interface CounterpartyCustomerOption {
  id: string
  tenantId?: string
  customerCode?: string
  customerName: string
  enabled?: boolean
  contactName?: string
  contactPhone?: string
  region?: string
  regionAdcode?: string | null
  addressDetail?: string
  longitude?: number | string | null
  latitude?: number | string | null
  fieldAccess?: Record<string, string>
  isRecordOwner?: boolean
}

export interface CounterpartyCustomerSelectorItem extends CounterpartyCustomerOption {
  addressId?: string | null
  addressType?: string
}

export interface CounterpartyCarrierSearchParams {
  carrierCode?: string
  companyName?: string
  excludeId?: string
  includeDisabled?: boolean
  ids?: string[]
  maxRows?: number
}

export interface CounterpartyCustomerSearchParams {
  excludeId?: string
  includeDisabled?: boolean
  tenantId?: string
}

export interface CounterpartyCustomerSelectorSearchParams {
  keyword?: string
  addressType?: string
  from?: number
  to?: number
}

interface SecureListPayload<TRecord> {
  records: TRecord[]
  total: number
}

const { supabase, responseHandle } = useSupabase()

export async function fetchCarrierOptions(
  params: CounterpartyCarrierSearchParams = {},
  options?: ApiRequestOptions
) {
  return await responseHandle<CounterpartyCarrierOption[]>(
    () =>
      withRequestOptions(
        supabase.rpc('tms_list_carrier_options_secure', {
          p_exclude_id: params.excludeId || null,
          p_include_disabled: params.includeDisabled ?? false,
          p_keyword: normalizeNullableText(String(params.companyName || params.carrierCode || '')),
          p_ids: params.ids?.length ? params.ids : null,
          p_max_rows: params.maxRows ?? 200
        }),
        options
      ),
    { showErrorMessage: true }
  )
}

export async function fetchCustomerOptions(
  params: CounterpartyCustomerSearchParams = {},
  options?: ApiRequestOptions
) {
  return await responseHandle<CounterpartyCustomerOption[]>(
    () =>
      withRequestOptions(
        supabase.rpc('tms_list_customer_options_secure', {
          p_exclude_id: params.excludeId || null,
          p_include_disabled: params.includeDisabled ?? false,
          p_tenant_id: params.tenantId || null
        }),
        options
      ),
    { showErrorMessage: true }
  )
}

export async function fetchCustomerSelectorList(
  params: CounterpartyCustomerSelectorSearchParams = {},
  options?: ApiRequestOptions
) {
  const result = await responseHandle<SecureListPayload<CounterpartyCustomerSelectorItem>>(
    () =>
      withRequestOptions(
        supabase.rpc('tms_list_customer_selector_secure', {
          p_from: params.from ?? 0,
          p_to: params.to ?? 9,
          p_keyword: normalizeNullableText(String(params.keyword ?? '')),
          p_address_type: params.addressType || null
        }),
        options
      ),
    { showErrorMessage: true }
  )
  return {
    data: result.data?.records ?? [],
    total: result.data?.total ?? 0,
    error: result.error
  }
}
