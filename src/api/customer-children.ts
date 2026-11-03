import { useSupabase } from '@/hooks/core/useSupabase'
import { withRequestOptions } from '@/api/providers/supabase/query'
import type { ApiRequestOptions } from '@/types/api/request'
import { pickDefinedPayload } from '@/utils/form/pick-defined-payload'

export type CustomerChildFieldAccessMap = Partial<
  Record<'contactPhone' | 'taxNo' | 'bankAccount', Api.Common.FieldAccessLevel>
>

export interface CustomerContact {
  id?: string
  customerId: string
  tenantId?: string
  name: string
  alias?: string | null
  position?: string | null
  department?: string | null
  mobile?: string | null
  telephone?: string | null
  email?: string | null
  qq?: string | null
  isDefault?: boolean
  role?: string | null
  createTime?: string
  updateTime?: string
  isRecordOwner?: boolean
}

export interface CustomerFinance {
  id?: string
  customerId: string
  tenantId?: string
  invoiceTitle: string
  taxNo?: string | null
  bankName?: string | null
  bankAccount?: string | null
  bankBranch?: string | null
  isDefaultInvoice?: boolean
  remark?: string | null
  createTime?: string
  updateTime?: string
  fieldAccess?: Pick<CustomerChildFieldAccessMap, 'taxNo' | 'bankAccount'>
  isRecordOwner?: boolean
}

interface WriteOptions {
  showMessage?: boolean
}

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

const CUSTOMER_CONTACT_PAYLOAD_KEYS = [
  'customerId',
  'name',
  'alias',
  'position',
  'department',
  'mobile',
  'telephone',
  'email',
  'qq',
  'isDefault',
  'role'
] as const satisfies readonly (keyof CustomerContact)[]

const CUSTOMER_FINANCE_PAYLOAD_KEYS = [
  'customerId',
  'invoiceTitle',
  'taxNo',
  'bankName',
  'bankAccount',
  'bankBranch',
  'isDefaultInvoice',
  'remark'
] as const satisfies readonly (keyof CustomerFinance)[]

export async function fetchCustomerContactList(customerId: string, options?: ApiRequestOptions) {
  return await responseHandle<CustomerContact[]>(
    () =>
      withRequestOptions(
        supabase.rpc('tms_list_customer_contacts_secure', {
          p_customer_id: customerId
        }),
        options
      ),
    { showErrorMessage: true }
  )
}

export async function addCustomerContact(params: CustomerContact, options: WriteOptions = {}) {
  const result = await responseHandle<string>(
    () =>
      supabase.rpc('tms_create_customer_contact_secure', {
        p_payload: keysToSnakeDeep(pickDefinedPayload(params, CUSTOMER_CONTACT_PAYLOAD_KEYS))
      }),
    {
      showMessage: options.showMessage ?? true,
      showErrorMessage: false,
      showReferenceFeedback: false,
      breakReturn: true
    }
  )
  return { ...result, data: result.data ? { id: result.data } : null }
}

export async function editCustomerContact(params: CustomerContact) {
  if (!params.id) throw new Error('联系人 ID 不能为空')
  return await responseHandle<CustomerContact>(
    () =>
      supabase.rpc('tms_update_customer_contact_secure', {
        p_id: params.id,
        p_payload: keysToSnakeDeep(pickDefinedPayload(params, CUSTOMER_CONTACT_PAYLOAD_KEYS))
      }),
    { showMessage: true, showErrorMessage: false, showReferenceFeedback: false, breakReturn: true }
  )
}

export async function copyCustomerContact(id: string) {
  return await responseHandle<CustomerContact>(
    () => supabase.rpc('tms_copy_customer_contact_secure', { p_id: id }),
    { showMessage: true, showErrorMessage: false, showReferenceFeedback: false, breakReturn: true }
  )
}

export async function deleteCustomerContact(id: string) {
  return await responseHandle<boolean>(
    () => supabase.rpc('tms_delete_customer_contact_secure', { p_id: id }),
    { showMessage: true, showErrorMessage: false, showReferenceFeedback: false, breakReturn: true }
  )
}

export async function deleteCustomerContactBatch(ids: string[]) {
  return await responseHandle<number>(
    () => supabase.rpc('tms_delete_customer_contacts_secure', { p_ids: ids }),
    { showMessage: true, showErrorMessage: false, showReferenceFeedback: false, breakReturn: true }
  )
}

export async function fetchCustomerFinanceList(customerId: string, options?: ApiRequestOptions) {
  return await responseHandle<CustomerFinance[]>(
    () =>
      withRequestOptions(
        supabase.rpc('tms_list_customer_finances_secure', {
          p_customer_id: customerId
        }),
        options
      ),
    { showErrorMessage: true }
  )
}

export async function fetchCustomerDefaultFinance(customerId: string) {
  return await responseHandle<CustomerFinance | null>(
    () => supabase.rpc('tms_get_customer_default_finance_secure', { p_customer_id: customerId }),
    { showErrorMessage: true }
  )
}

export async function addCustomerFinance(params: CustomerFinance, options: WriteOptions = {}) {
  const result = await responseHandle<string>(
    () =>
      supabase.rpc('tms_create_customer_finance_secure', {
        p_payload: keysToSnakeDeep(pickDefinedPayload(params, CUSTOMER_FINANCE_PAYLOAD_KEYS))
      }),
    {
      showMessage: options.showMessage ?? true,
      showErrorMessage: false,
      showReferenceFeedback: false,
      breakReturn: true
    }
  )
  return { ...result, data: result.data ? { id: result.data } : null }
}

export async function editCustomerFinance(params: CustomerFinance) {
  if (!params.id) throw new Error('财务信息 ID 不能为空')
  return await responseHandle<CustomerFinance>(
    () =>
      supabase.rpc('tms_update_customer_finance_secure', {
        p_id: params.id,
        p_payload: keysToSnakeDeep(pickDefinedPayload(params, CUSTOMER_FINANCE_PAYLOAD_KEYS))
      }),
    { showMessage: true, showErrorMessage: false, showReferenceFeedback: false, breakReturn: true }
  )
}

export async function copyCustomerFinance(id: string) {
  return await responseHandle<CustomerFinance>(
    () => supabase.rpc('tms_copy_customer_finance_secure', { p_id: id }),
    { showMessage: true, showErrorMessage: false, showReferenceFeedback: false, breakReturn: true }
  )
}

export async function deleteCustomerFinance(id: string) {
  return await responseHandle<boolean>(
    () => supabase.rpc('tms_delete_customer_finance_secure', { p_id: id }),
    { showMessage: true, showErrorMessage: false, showReferenceFeedback: false, breakReturn: true }
  )
}

export async function deleteCustomerFinanceBatch(ids: string[]) {
  return await responseHandle<number>(
    () => supabase.rpc('tms_delete_customer_finances_secure', { p_ids: ids }),
    { showMessage: true, showErrorMessage: false, showReferenceFeedback: false, breakReturn: true }
  )
}
