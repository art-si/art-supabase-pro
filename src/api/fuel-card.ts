import { useSupabase } from '@/hooks/core/useSupabase'
import type { RunQueryOptions } from '@/hooks/core/useSupabase'
import { buildSupabasePageRange } from '@/utils/supabase/pagination'
import { buildSupabaseRpcRange } from '@/utils/supabase'
import { normalizeNullableText } from '@/utils/form/normalize'
import { isPlainObjectRecord } from '@/utils/type-guards'
import type {
  EmployeeSelectorContractParams,
  EmployeeSelectorContractResult,
  EmployeeIntegrationItem
} from '@/api/integration/employees'
import { parseFuelCardLedgerPage, parseFuelCardPage } from './fuel-card.model'

export type FuelCardStatus = 'active' | 'lost' | 'disabled'
export type FuelCardFuelType = 'diesel_0' | 'gasoline_92'
export type FuelCardPaymentMethod = 'fuel_card'
export type FuelCardEntryType = 'opening' | 'recharge' | 'consume' | 'reversal'

export interface FuelCard {
  id: string
  tenantId: string
  cardNo: string
  vehicleId: string
  plateNo: string
  companyName: string | null
  issuer: string
  imagePath: string | null
  fuelType: FuelCardFuelType
  ownerEmployeeId: string | null
  ownerEmployeeName: string | null
  openerEmployeeId: string | null
  openerEmployeeName: string | null
  driverId: string | null
  driverName: string | null
  remark: string
  status: FuelCardStatus
  balance: number
  createTime: string
  updateTime: string
}

export interface FuelCardEntry {
  id: string
  tenantId: string
  cardId: string
  cardNo: string
  vehicleId: string
  plateNo: string
  companyName: string | null
  cardStatus: FuelCardStatus
  driverId: string | null
  driverName: string | null
  stationName: string
  liters: number | null
  unitPrice: number | null
  paymentMethod: FuelCardPaymentMethod | null
  voucherPaths: string[]
  sourceCostId: string | null
  sourceCostNo: string | null
  cardBalance: number
  rechargeChannel: string
  invoiceNo: string
  rechargerEmployeeId: string | null
  rechargerEmployeeName: string | null
  waybillId: string | null
  waybillNo: string | null
  occurredAt: string | null
  expenseLocation: string
  expenseLongitude: number | null
  expenseLatitude: number | null
  expenseCoordinateSystem: string | null
  expenseCoordinateSource: string | null
  expenseCoordinateStatus: string
  expenseGeocodeProvider: string | null
  expenseGeocodedAt: string | null
  odometerKm: number | null
  /** Completed waybill fuel used per 100 km; null when execution inputs are incomplete or overlap. */
  tripFuelPer100Km: number | null
  entryType: FuelCardEntryType
  amount: number
  signedAmount: number
  balanceAfter: number
  occurredOn: string
  referenceNo: string
  remark: string
  reversesEntryId: string | null
  isReversed: boolean
  createTime: string
}

export interface FuelCardListFilters {
  cardId?: string
  keyword?: string
  status?: FuelCardStatus | ''
  vehicleId?: string
}

export interface FuelCardLedgerFilters {
  cardId?: string
  vehicleId?: string
  entryType?: FuelCardEntryType | ''
  occurredFrom?: string
  occurredTo?: string
}

export interface FuelCardPageParams extends FuelCardListFilters {
  current: number
  size: number
}

export interface FuelCardLedgerPageParams extends FuelCardLedgerFilters {
  current: number
  size: number
}

export interface CreateFuelCardInput {
  cardNo: string
  vehicleId: string
  issuer?: string
  remark?: string
  openingBalance?: number
  imagePath?: string | null
  fuelType?: FuelCardFuelType
  ownerEmployeeId?: string | null
  openerEmployeeId?: string | null
}

export interface UpdateFuelCardInput {
  id: string
  imagePath: string | null
  fuelType: FuelCardFuelType
  ownerEmployeeId: string | null
  openerEmployeeId: string | null
  issuer: string
  remark: string
}

export interface RecordFuelCardTransactionInput {
  cardId: string
  entryType: 'recharge' | 'consume' | 'reversal'
  amount: number
  occurredOn: string
  referenceNo?: string
  remark?: string
  reversesEntryId?: string
  stationName?: string
  liters?: number | null
  unitPrice?: number | null
  paymentMethod?: FuelCardPaymentMethod | null
  voucherPaths?: string[]
  driverId?: string | null
  rechargeChannel?: string
  invoiceNo?: string
  rechargerEmployeeId?: string | null
  waybillId?: string | null
  occurredAt?: string | null
  expenseLocation?: string
  expenseLongitude?: number | null
  expenseLatitude?: number | null
  expenseCoordinateSystem?: string | null
  expenseCoordinateSource?: string | null
  expenseCoordinateStatus?: string
  expenseGeocodeProvider?: string | null
  expenseGeocodedAt?: string | null
  odometerKm?: number | null
}

interface FuelCardExportOptions extends FuelCardListFilters {
  selectedIds?: string[]
  maxRows?: number
}

interface FuelCardLedgerExportOptions extends FuelCardLedgerFilters {
  selectedIds?: string[]
  maxRows?: number
}

const { supabase, responseHandle } = useSupabase()

async function listCards(
  params: FuelCardPageParams,
  options: { export: boolean; selectedIds?: string[] }
) {
  const { from, to } = buildSupabasePageRange(params)
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('vms_list_fuel_cards_secure', {
        p_from: from,
        p_to: to,
        p_keyword: normalizeNullableText(params.keyword),
        p_status: params.status || null,
        p_vehicle_id: params.vehicleId || null,
        p_export: options.export,
        p_ids: options.selectedIds?.length
          ? options.selectedIds
          : params.cardId
            ? [params.cardId]
            : null
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '油卡档案加载失败，请重试' }
  )
  return parseFuelCardPage(result.data)
}

async function listEntries(
  params: FuelCardLedgerPageParams,
  options: { export: boolean; selectedIds?: string[] }
) {
  const { from, to } = buildSupabasePageRange(params)
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('vms_list_fuel_card_entries_secure', {
        p_from: from,
        p_to: to,
        p_card_id: params.cardId || null,
        p_vehicle_id: params.vehicleId || null,
        p_entry_type: params.entryType || null,
        p_occurred_from: params.occurredFrom || null,
        p_occurred_to: params.occurredTo || null,
        p_export: options.export,
        p_ids: options.selectedIds?.length ? options.selectedIds : null
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '油卡流水加载失败，请重试' }
  )
  return parseFuelCardLedgerPage(result.data)
}

export function fetchFuelCardList(params: FuelCardPageParams) {
  return listCards(params, { export: false })
}

export function fetchFuelCardLedgerList(params: FuelCardLedgerPageParams) {
  return listEntries(params, { export: false })
}

/** Full tenant roster for the card owner and opener fields. */
export async function fetchFuelCardEmployeeOptions(
  params: EmployeeSelectorContractParams = {},
  options: Pick<RunQueryOptions, 'showErrorMessage'> = {}
): Promise<EmployeeSelectorContractResult> {
  const { from = 0, to = 19, keyword, tenantId } = params
  const range = buildSupabaseRpcRange(from, to)
  const result = await responseHandle<{
    records: EmployeeIntegrationItem[]
    total: number
  }>(
    () =>
      supabase.rpc('vms_list_fuel_card_employee_options_secure', {
        ...range,
        p_keyword: normalizeNullableText(keyword),
        p_tenant_id: tenantId || null
      }),
    { showErrorMessage: options.showErrorMessage ?? true }
  )
  return {
    data: result.data?.records ?? [],
    total: result.data?.total ?? 0,
    error: result.error,
    fieldAccess: {}
  }
}

export interface FuelCardWaybillOption {
  id: string
  tenantId: string
  waybillNo: string
  vehicleId: string
  status: string
  createTime: string
}

/** Waybills for the selected card's tenant and vehicle. */
export async function fetchFuelCardWaybillOptions(params: {
  cardId: string
  from?: number
  to?: number
  keyword?: string
}): Promise<{ data: FuelCardWaybillOption[]; total: number }> {
  const range = buildSupabaseRpcRange(params.from ?? 0, params.to ?? 19)
  const { data } = await responseHandle<{
    records: FuelCardWaybillOption[]
    total: number
  }>(
    () =>
      supabase.rpc('vms_list_fuel_card_waybill_options_secure', {
        p_card_id: params.cardId,
        ...range,
        p_keyword: normalizeNullableText(params.keyword)
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '关联运单加载失败，请重试' }
  )
  return { data: data?.records ?? [], total: data?.total ?? 0 }
}

export interface FuelCardDriverOption {
  id: string
  tenantId: string
  driverName: string
  phone: string
  employeeId: string | null
  isPrimary: boolean
}

export interface FuelCardOwnerSuggestion {
  employeeId: string
  employeeName: string
  tenantId: string
}

/** Exact roster employee linked to an approved vehicle's primary driver. */
export async function fetchFuelCardOwnerSuggestion(
  vehicleId: string
): Promise<FuelCardOwnerSuggestion | null> {
  const { data } = await responseHandle<unknown>(
    () => supabase.rpc('vms_fuel_card_owner_suggestion_secure', { p_vehicle_id: vehicleId }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '主司机花名册带入失败，请手动选择' }
  )
  if (data === null) return null
  if (
    !isPlainObjectRecord(data) ||
    typeof data.employeeId !== 'string' ||
    typeof data.employeeName !== 'string' ||
    typeof data.tenantId !== 'string'
  ) {
    throw new Error('主司机花名册数据异常，请手动选择卡归属人')
  }
  return {
    employeeId: data.employeeId,
    employeeName: data.employeeName,
    tenantId: data.tenantId
  }
}

export async function fetchFuelCardDriverOptions(params: {
  cardId: string
  from?: number
  to?: number
  keyword?: string
}): Promise<{ data: FuelCardDriverOption[]; total: number }> {
  const range = buildSupabaseRpcRange(params.from ?? 0, params.to ?? 19)
  const { data } = await responseHandle<{
    records: FuelCardDriverOption[]
    total: number
  }>(
    () =>
      supabase.rpc('vms_list_fuel_card_driver_options_secure', {
        p_card_id: params.cardId,
        ...range,
        p_keyword: normalizeNullableText(params.keyword)
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '司机候选加载失败，请重试' }
  )
  return { data: data?.records ?? [], total: data?.total ?? 0 }
}

async function exportPages<T>(
  maxRows: number | undefined,
  fetchPage: (current: number, size: number) => Promise<{ data: T[]; total: number }>
) {
  const limit = Math.min(Math.max(Math.trunc(maxRows ?? 5000), 1), 5000)
  const pageSize = Math.min(500, limit)
  const batches: T[][] = []
  let loaded = 0
  let total = 0
  for (let current = 1; loaded < limit; current += 1) {
    const page = await fetchPage(current, pageSize)
    total = page.total
    batches.push(page.data)
    loaded += page.data.length
    if (loaded >= total || page.data.length === 0) break
  }
  return { data: batches.flat().slice(0, limit), total }
}

export function exportFuelCardList(options: FuelCardExportOptions = {}) {
  return exportPages(options.maxRows, (current, size) =>
    listCards({ ...options, current, size }, { export: true, selectedIds: options.selectedIds })
  )
}

export function exportFuelCardLedgerList(options: FuelCardLedgerExportOptions = {}) {
  return exportPages(options.maxRows, (current, size) =>
    listEntries({ ...options, current, size }, { export: true, selectedIds: options.selectedIds })
  )
}

export async function createFuelCard(input: CreateFuelCardInput): Promise<string> {
  const result = await responseHandle<string>(
    () =>
      supabase.rpc('vms_create_fuel_card_v2', {
        p_card_no: input.cardNo,
        p_vehicle_id: input.vehicleId,
        p_issuer: input.issuer ?? '',
        p_remark: input.remark ?? '',
        p_opening_balance: input.openingBalance ?? 0,
        p_image_path: input.imagePath ?? null,
        p_fuel_type: input.fuelType ?? 'diesel_0',
        p_owner_employee_id: input.ownerEmployeeId ?? null,
        p_opener_employee_id: input.openerEmployeeId ?? null
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '油卡创建失败，请重试' }
  )
  if (!result.data) throw new Error('油卡创建结果异常，请重试')
  return result.data
}

/** Update card metadata without altering its vehicle, status or computed balance. */
export async function updateFuelCard(input: UpdateFuelCardInput): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('vms_update_fuel_card', {
        p_card_id: input.id,
        p_image_path: input.imagePath,
        p_fuel_type: input.fuelType,
        p_owner_employee_id: input.ownerEmployeeId,
        p_opener_employee_id: input.openerEmployeeId,
        p_issuer: input.issuer,
        p_remark: input.remark
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '油卡资料更新失败，请重试' }
  )
}

export async function setFuelCardStatus(id: string, status: FuelCardStatus): Promise<void> {
  await responseHandle(
    () => supabase.rpc('vms_set_fuel_card_status', { p_card_id: id, p_status: status }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '油卡状态更新失败，请重试' }
  )
}

export async function recordFuelCardTransaction(
  input: RecordFuelCardTransactionInput
): Promise<string> {
  if (
    (input.entryType === 'consume' &&
      input.paymentMethod != null &&
      input.paymentMethod !== 'fuel_card') ||
    (input.entryType !== 'consume' && input.paymentMethod != null)
  ) {
    throw new Error('油卡流水只能登记油卡消费；电卡和现金请使用对应业务入口')
  }
  const result = await responseHandle<string>(
    () =>
      supabase.rpc('vms_record_fuel_card_transaction_v4', {
        p_card_id: input.cardId,
        p_entry_type: input.entryType,
        p_amount: input.amount,
        p_occurred_on: input.occurredOn,
        p_reference_no: input.referenceNo ?? '',
        p_remark: input.remark ?? '',
        p_reverses_entry_id: input.reversesEntryId ?? null,
        p_station_name: input.stationName ?? '',
        p_liters: input.liters ?? null,
        p_unit_price: input.unitPrice ?? null,
        p_payment_method: input.entryType === 'consume' ? 'fuel_card' : null,
        p_voucher_paths: input.voucherPaths ?? [],
        p_driver_id: input.driverId ?? null,
        p_recharge_channel: input.rechargeChannel ?? '',
        p_invoice_no: input.invoiceNo ?? '',
        p_recharger_employee_id: input.rechargerEmployeeId ?? null,
        p_waybill_id: input.waybillId ?? null,
        p_occurred_at: input.occurredAt ?? null,
        p_expense_location: input.expenseLocation ?? '',
        p_odometer_km: input.odometerKm ?? null,
        p_expense_longitude: input.expenseLongitude ?? null,
        p_expense_latitude: input.expenseLatitude ?? null,
        p_expense_coordinate_system: input.expenseCoordinateSystem ?? null,
        p_expense_coordinate_source: input.expenseCoordinateSource ?? null,
        p_expense_coordinate_status: input.expenseCoordinateStatus ?? 'pending',
        p_expense_geocode_provider: input.expenseGeocodeProvider ?? null,
        p_expense_geocoded_at: input.expenseGeocodedAt ?? null
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '油卡流水登记失败，请重试' }
  )
  if (!result.data) throw new Error('油卡流水登记结果异常，请重试')
  return result.data
}

/** Append evidence to an existing ledger row without changing its financial posting. */
export async function appendFuelCardEntryVouchers(id: string, paths: string[]): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('vms_append_card_entry_vouchers_secure', {
        p_card_kind: 'fuel',
        p_entry_id: id,
        p_paths: paths
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '现场凭证补传失败，请重试' }
  )
}
