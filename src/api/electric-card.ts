import { useSupabase } from '@/hooks/core/useSupabase'
import { buildSupabasePageRange } from '@/utils/supabase/pagination'
import { normalizeNullableText } from '@/utils/form/normalize'
import { isPlainObjectRecord } from '@/utils/type-guards'
import { buildSupabaseRpcRange } from '@/utils/supabase'
import type {
  EmployeeSelectorContractParams,
  EmployeeSelectorContractResult,
  EmployeeIntegrationItem
} from '@/api/integration/employees'

export type ElectricCardStatus = 'active' | 'lost' | 'disabled'
export type ElectricCardEntryType = 'opening' | 'recharge' | 'consume' | 'reversal'

export interface ElectricCard {
  id: string
  tenantId: string
  vehicleId: string
  plateNo: string
  companyName: string | null
  cardNo: string
  issuer: string
  imagePath: string | null
  ownerEmployeeId: string | null
  ownerEmployeeName: string | null
  openerEmployeeId: string | null
  openerEmployeeName: string | null
  driverId: string | null
  driverName: string | null
  status: ElectricCardStatus
  balance: number
  remark: string
  createTime: string
  updateTime: string
}

export interface ElectricCardEntry {
  id: string
  postingSeq: number
  tenantId: string
  cardId: string
  cardNo: string
  vehicleId: string
  plateNo: string
  cardStatus: ElectricCardStatus
  driverId: string | null
  driverName: string | null
  entryType: ElectricCardEntryType
  amount: number
  signedAmount: number
  balanceAfter: number
  cardBalance: number
  occurredAt: string
  chargeKwh: number | null
  unitPrice: number | null
  stationName: string
  pileNo: string
  rechargeChannel: string
  invoiceNo: string
  referenceNo: string
  voucherPaths: string[]
  remark: string
  reversesEntryId: string | null
  isReversed: boolean
  createTime: string
}

export interface ElectricCardFilters {
  keyword?: string
  status?: ElectricCardStatus
  cardId?: string
}

export interface ElectricCardEntryFilters {
  cardId?: string
  entryType?: ElectricCardEntryType
  occurredFrom?: string
  occurredTo?: string
}

export interface ElectricCardTransactionInput {
  cardId: string
  entryType: 'recharge' | 'consume' | 'reversal'
  amount: number
  occurredAt: string
  chargeKwh?: number | null
  unitPrice?: number | null
  stationName?: string
  pileNo?: string
  rechargeChannel?: string
  invoiceNo?: string
  referenceNo?: string
  voucherPaths?: string[]
  driverId?: string | null
  reversesEntryId?: string | null
  remark?: string
}

const { supabase, responseHandle } = useSupabase()

function readText(row: Record<string, unknown>, key: string): string {
  if (typeof row[key] !== 'string') throw new Error('电卡数据格式异常，请刷新后重试')
  return row[key]
}

function readOptionalText(row: Record<string, unknown>, key: string): string | null {
  if (row[key] === null) return null
  return readText(row, key)
}

function readNumber(row: Record<string, unknown>, key: string): number {
  if (typeof row[key] !== 'number' || !Number.isFinite(row[key])) {
    throw new Error('电卡金额格式异常，请刷新后重试')
  }
  return row[key]
}

function readStatus(row: Record<string, unknown>, key: string): ElectricCardStatus {
  const value = readText(row, key)
  if (value !== 'active' && value !== 'lost' && value !== 'disabled') {
    throw new Error('电卡状态格式异常，请刷新后重试')
  }
  return value
}

function parsePage<T>(
  value: unknown,
  parser: (row: Record<string, unknown>) => T
): { data: T[]; total: number } {
  if (!isPlainObjectRecord(value) || !Array.isArray(value.records)) {
    throw new Error('电卡查询结果异常，请刷新后重试')
  }
  if (typeof value.total !== 'number' || !Number.isSafeInteger(value.total) || value.total < 0) {
    throw new Error('电卡查询总数异常，请刷新后重试')
  }
  return {
    total: value.total,
    data: value.records.map((item) => {
      if (!isPlainObjectRecord(item)) throw new Error('电卡记录格式异常，请刷新后重试')
      return parser(item)
    })
  }
}

function parseCard(row: Record<string, unknown>): ElectricCard {
  return {
    id: readText(row, 'id'),
    tenantId: readText(row, 'tenantId'),
    vehicleId: readText(row, 'vehicleId'),
    plateNo: readText(row, 'plateNo'),
    companyName: readOptionalText(row, 'companyName'),
    cardNo: readText(row, 'cardNo'),
    issuer: readText(row, 'issuer'),
    imagePath: readOptionalText(row, 'imagePath'),
    ownerEmployeeId: readOptionalText(row, 'ownerEmployeeId'),
    ownerEmployeeName: readOptionalText(row, 'ownerEmployeeName'),
    openerEmployeeId: readOptionalText(row, 'openerEmployeeId'),
    openerEmployeeName: readOptionalText(row, 'openerEmployeeName'),
    driverId: readOptionalText(row, 'driverId'),
    driverName: readOptionalText(row, 'driverName'),
    status: readStatus(row, 'status'),
    balance: readNumber(row, 'balance'),
    remark: readText(row, 'remark'),
    createTime: readText(row, 'createTime'),
    updateTime: readText(row, 'updateTime')
  }
}

function parseEntry(row: Record<string, unknown>): ElectricCardEntry {
  const type = readText(row, 'entryType')
  if (!['opening', 'recharge', 'consume', 'reversal'].includes(type)) {
    throw new Error('电卡流水类型异常，请刷新后重试')
  }
  if (
    !Array.isArray(row.voucherPaths) ||
    !row.voucherPaths.every((item) => typeof item === 'string')
  ) {
    throw new Error('电卡凭证格式异常，请刷新后重试')
  }
  if (typeof row.isReversed !== 'boolean') {
    throw new Error('电卡冲正状态异常，请刷新后重试')
  }
  return {
    id: readText(row, 'id'),
    postingSeq: readNumber(row, 'postingSeq'),
    tenantId: readText(row, 'tenantId'),
    cardId: readText(row, 'cardId'),
    cardNo: readText(row, 'cardNo'),
    vehicleId: readText(row, 'vehicleId'),
    plateNo: readText(row, 'plateNo'),
    cardStatus: readStatus(row, 'cardStatus'),
    driverId: readOptionalText(row, 'driverId'),
    driverName: readOptionalText(row, 'driverName'),
    entryType: type as ElectricCardEntryType,
    amount: readNumber(row, 'amount'),
    signedAmount: readNumber(row, 'signedAmount'),
    balanceAfter: readNumber(row, 'balanceAfter'),
    cardBalance: readNumber(row, 'cardBalance'),
    occurredAt: readText(row, 'occurredAt'),
    chargeKwh: row.chargeKwh === null ? null : readNumber(row, 'chargeKwh'),
    unitPrice: row.unitPrice === null ? null : readNumber(row, 'unitPrice'),
    stationName: readText(row, 'stationName'),
    pileNo: readText(row, 'pileNo'),
    rechargeChannel: readText(row, 'rechargeChannel'),
    invoiceNo: readText(row, 'invoiceNo'),
    referenceNo: readText(row, 'referenceNo'),
    voucherPaths: row.voucherPaths,
    remark: readText(row, 'remark'),
    reversesEntryId: readOptionalText(row, 'reversesEntryId'),
    isReversed: row.isReversed,
    createTime: readText(row, 'createTime')
  }
}

export async function fetchElectricCards(
  params: ElectricCardFilters & { current: number; size: number }
) {
  const { from, to } = buildSupabasePageRange(params)
  const { data } = await responseHandle<unknown>(
    () =>
      supabase.rpc('vms_list_electric_cards_secure', {
        p_from: from,
        p_to: to,
        p_keyword: normalizeNullableText(params.keyword),
        p_status: params.status || null,
        p_card_id: params.cardId || null
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '电卡档案加载失败，请重试' }
  )
  return parsePage(data, parseCard)
}

export async function fetchElectricCardEntries(
  params: ElectricCardEntryFilters & { current: number; size: number }
) {
  const { from, to } = buildSupabasePageRange(params)
  const { data } = await responseHandle<unknown>(
    () =>
      supabase.rpc('vms_list_electric_card_entries_secure', {
        p_from: from,
        p_to: to,
        p_card_id: params.cardId || null,
        p_entry_type: params.entryType || null,
        p_occurred_from: params.occurredFrom || null,
        p_occurred_to: params.occurredTo || null
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '电卡流水加载失败，请重试' }
  )
  return parsePage(data, parseEntry)
}

export async function fetchElectricCardEmployeeOptions(
  params: EmployeeSelectorContractParams = {}
): Promise<EmployeeSelectorContractResult> {
  const range = buildSupabaseRpcRange(params.from ?? 0, params.to ?? 19)
  const result = await responseHandle<{
    records: EmployeeIntegrationItem[]
    total: number
  }>(
    () =>
      supabase.rpc('vms_list_electric_card_employee_options_secure', {
        ...range,
        p_keyword: normalizeNullableText(params.keyword),
        p_tenant_id: params.tenantId || null
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '电卡员工候选加载失败，请重试' }
  )
  return {
    data: result.data?.records ?? [],
    total: result.data?.total ?? 0,
    error: result.error,
    fieldAccess: {}
  }
}

export async function createElectricCard(input: {
  cardNo: string
  vehicleId: string
  issuer: string
  imagePath: string | null
  ownerEmployeeId: string | null
  openerEmployeeId: string | null
  openingBalance: number
  remark: string
}): Promise<string> {
  const { data } = await responseHandle<string>(
    () =>
      supabase.rpc('vms_create_electric_card', {
        p_card_no: input.cardNo,
        p_vehicle_id: input.vehicleId,
        p_issuer: input.issuer,
        p_image_path: input.imagePath,
        p_owner_employee_id: input.ownerEmployeeId,
        p_opener_employee_id: input.openerEmployeeId,
        p_opening_balance: input.openingBalance,
        p_remark: input.remark
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '电卡创建失败，请重试' }
  )
  if (!data) throw new Error('电卡创建结果异常，请重试')
  return data
}

export async function updateElectricCard(input: {
  id: string
  issuer: string
  imagePath: string | null
  ownerEmployeeId: string | null
  openerEmployeeId: string | null
  remark: string
}): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('vms_update_electric_card', {
        p_card_id: input.id,
        p_issuer: input.issuer,
        p_image_path: input.imagePath,
        p_owner_employee_id: input.ownerEmployeeId,
        p_opener_employee_id: input.openerEmployeeId,
        p_remark: input.remark
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '电卡资料更新失败，请重试' }
  )
}

export async function setElectricCardStatus(id: string, status: ElectricCardStatus): Promise<void> {
  await responseHandle(
    () => supabase.rpc('vms_set_electric_card_status', { p_card_id: id, p_status: status }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '电卡状态更新失败，请重试' }
  )
}

export async function recordElectricCardTransaction(
  input: ElectricCardTransactionInput
): Promise<string> {
  const { data } = await responseHandle<string>(
    () =>
      supabase.rpc('vms_record_electric_card_transaction', {
        p_card_id: input.cardId,
        p_entry_type: input.entryType,
        p_amount: input.amount,
        p_occurred_at: input.occurredAt,
        p_charge_kwh: input.chargeKwh ?? null,
        p_unit_price: input.unitPrice ?? null,
        p_station_name: input.stationName ?? '',
        p_pile_no: input.pileNo ?? '',
        p_recharge_channel: input.rechargeChannel ?? '',
        p_invoice_no: input.invoiceNo ?? '',
        p_reference_no: input.referenceNo ?? '',
        p_voucher_paths: input.voucherPaths ?? [],
        p_driver_id: input.driverId ?? null,
        p_reverses_entry_id: input.reversesEntryId ?? null,
        p_remark: input.remark ?? ''
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '电卡流水登记失败，请重试' }
  )
  if (!data) throw new Error('电卡流水登记结果异常，请重试')
  return data
}
