import { useSupabase } from '@/hooks/core/useSupabase'
import { normalizeNullableText } from '@/utils/form/normalize'
import { isPlainObjectRecord } from '@/utils/type-guards'

const { supabase, responseHandle } = useSupabase()

export type MobileAccountKind = 'driver' | 'shipper'

export interface MobileAccountRecord {
  authUserId: string
  userId: string | null
  tenantId: string
  tenantName: string
  kind: MobileAccountKind
  displayName: string
  email: string
  phone: string
  enabled: boolean
  accountEnabled: boolean
  driverId: string | null
  driverName: string | null
  carrierName: string | null
  customerId: string | null
  customerName: string | null
  orderActorId: string | null
  wechatBound: boolean
  version: string | null
}

export interface MobileAccountOption {
  id: string
  label: string
  enabled: boolean
}

export interface MobileAccountUserOption extends MobileAccountOption {
  authUserId: string
  email: string
  phone: string
}

export interface MobileAccountWorkspace {
  account: MobileAccountRecord | null
  users: MobileAccountUserOption[]
  drivers: MobileAccountOption[]
  customers: MobileAccountOption[]
  orderActors: MobileAccountOption[]
}

export interface MobileAccountWrite {
  authUserId: string
  tenantId: string
  kind: MobileAccountKind
  displayName: string
  phone: string
  enabled: boolean
  driverId: string | null
  customerId: string | null
  orderActorId: string | null
  expectedVersion: string | null
}

function isMobileAccount(value: unknown): value is MobileAccountRecord {
  return (
    isPlainObjectRecord(value) &&
    ['authUserId', 'tenantId', 'tenantName', 'displayName', 'email', 'phone'].every(
      (key) => typeof value[key] === 'string'
    ) &&
    [
      'userId',
      'driverId',
      'driverName',
      'carrierName',
      'customerId',
      'customerName',
      'orderActorId',
      'version'
    ].every((key) => value[key] === null || typeof value[key] === 'string') &&
    ['enabled', 'accountEnabled', 'wechatBound'].every((key) => typeof value[key] === 'boolean') &&
    (value.kind === 'driver' || value.kind === 'shipper')
  )
}

function parseMobileAccount(value: unknown): MobileAccountRecord {
  if (!isMobileAccount(value)) throw new Error('移动端账号信息异常，请重新加载')
  return value
}

function isAccountOption(value: unknown): value is MobileAccountOption {
  return (
    isPlainObjectRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    typeof value.enabled === 'boolean'
  )
}

function parseWorkspace(value: unknown): MobileAccountWorkspace {
  if (
    !isPlainObjectRecord(value) ||
    !(value.account === null || isMobileAccount(value.account)) ||
    !Array.isArray(value.users) ||
    !value.users.every(
      (item): item is MobileAccountUserOption =>
        isAccountOption(item) &&
        isPlainObjectRecord(item) &&
        ['authUserId', 'email', 'phone'].every((key) => typeof item[key] === 'string')
    ) ||
    !Array.isArray(value.drivers) ||
    !value.drivers.every(isAccountOption) ||
    !Array.isArray(value.customers) ||
    !value.customers.every(isAccountOption) ||
    !Array.isArray(value.orderActors) ||
    !value.orderActors.every(isAccountOption)
  ) {
    throw new Error('客户端关联选项异常，请重新加载')
  }
  return {
    account: value.account,
    users: value.users,
    drivers: value.drivers,
    customers: value.customers,
    orderActors: value.orderActors
  }
}

export async function fetchMobileAccounts(params: {
  keyword?: string
  kind?: MobileAccountKind
  tenantId?: string
  current?: number
  size?: number
}) {
  const response = await responseHandle<{ records: MobileAccountRecord[]; total: number }>(
    () =>
      supabase.rpc('system_list_mobile_accounts', {
        p_keyword: normalizeNullableText(params.keyword),
        p_kind: params.kind || null,
        p_tenant_id: params.tenantId || null,
        p_offset: ((params.current ?? 1) - 1) * (params.size ?? 20),
        p_limit: params.size ?? 20
      }),
    { breakReturn: true, showErrorMessage: false }
  )
  const value: unknown = response.data
  if (
    !isPlainObjectRecord(value) ||
    !Array.isArray(value.records) ||
    !value.records.every(isMobileAccount) ||
    typeof value.total !== 'number' ||
    !Number.isSafeInteger(value.total) ||
    value.total < 0
  ) {
    throw new Error('移动端账号列表异常，请重新加载')
  }
  return { ...response, data: value.records, total: value.total }
}

export async function fetchMobileAccountWorkspace(params: {
  tenantId: string
  authUserId?: string
  kind: MobileAccountKind
}) {
  const response = await responseHandle<unknown>(
    () =>
      supabase.rpc('system_mobile_account_workspace', {
        p_tenant_id: params.tenantId,
        p_auth_user_id: params.authUserId || null,
        p_kind: params.kind
      }),
    { breakReturn: true, showErrorMessage: false }
  )
  return { ...response, data: parseWorkspace(response.data) }
}

export async function fetchMobileAccountTarget(authUserId: string, kind: MobileAccountKind) {
  const response = await responseHandle<unknown>(
    () =>
      supabase.rpc('system_mobile_account_target', { p_auth_user_id: authUserId, p_kind: kind }),
    { breakReturn: true, showErrorMessage: false }
  )
  return { ...response, data: parseMobileAccount(response.data) }
}

export async function saveMobileAccount(input: MobileAccountWrite) {
  const response = await responseHandle<unknown>(
    () => supabase.rpc('system_save_mobile_account', { p_input: input }),
    { breakReturn: true, showErrorMessage: false }
  )
  return { ...response, data: parseMobileAccount(response.data) }
}

export async function createShipperAccount(
  input: Omit<MobileAccountWrite, 'authUserId' | 'expectedVersion'> & {
    email: string
    password: string
  }
) {
  const response = await responseHandle<unknown>(
    () =>
      supabase.functions.invoke('mobile-account-admin', { body: { action: 'create', ...input } }),
    { breakReturn: true, showErrorMessage: false }
  )
  return { ...response, data: parseMobileAccount(response.data) }
}

export async function resetMobileAccountPassword(authUserId: string, password: string) {
  const response = await responseHandle<unknown>(
    () =>
      supabase.functions.invoke('mobile-account-admin', {
        body: { action: 'reset_password', authUserId, password }
      }),
    { breakReturn: true, showErrorMessage: false }
  )
  if (!isPlainObjectRecord(response.data) || response.data.ok !== true) {
    throw new Error('密码重置结果异常，请重新加载后核对账号状态')
  }
  return { ...response, data: { ok: true } }
}
