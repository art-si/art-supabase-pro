import { useSupabase } from '@/hooks/core/useSupabase'
import { buildSupabasePageRange } from '@/utils/supabase/pagination'
import { normalizeNullableText } from '@/utils/form/normalize'
import { parseFuelCardLedgerPage, parseFuelCardPage } from './fuel-card.model'

export type FuelCardStatus = 'active' | 'disabled'
export type FuelCardEntryType = 'opening' | 'recharge' | 'consume' | 'reversal'

export interface FuelCard {
  id: string
  tenantId: string
  cardNo: string
  vehicleId: string
  plateNo: string
  issuer: string
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
}

export interface RecordFuelCardTransactionInput {
  cardId: string
  entryType: 'recharge' | 'consume' | 'reversal'
  amount: number
  occurredOn: string
  referenceNo?: string
  remark?: string
  reversesEntryId?: string
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
      supabase.rpc('vms_create_fuel_card', {
        p_card_no: input.cardNo,
        p_vehicle_id: input.vehicleId,
        p_issuer: input.issuer ?? '',
        p_remark: input.remark ?? '',
        p_opening_balance: input.openingBalance ?? 0
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '油卡创建失败，请重试' }
  )
  if (!result.data) throw new Error('油卡创建结果异常，请重试')
  return result.data
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
  const result = await responseHandle<string>(
    () =>
      supabase.rpc('vms_record_fuel_card_transaction', {
        p_card_id: input.cardId,
        p_entry_type: input.entryType,
        p_amount: input.amount,
        p_occurred_on: input.occurredOn,
        p_reference_no: input.referenceNo ?? '',
        p_remark: input.remark ?? '',
        p_reverses_entry_id: input.reversesEntryId ?? null
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '油卡流水登记失败，请重试' }
  )
  if (!result.data) throw new Error('油卡流水登记结果异常，请重试')
  return result.data
}
