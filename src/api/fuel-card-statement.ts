import { useSupabase } from '@/hooks/core/useSupabase'
import { isPlainObjectRecord } from '@/utils/type-guards'

export type FuelStatementMatchStatus = 'matched' | 'difference' | 'unmatched'

export interface FuelStatementImportRow {
  sourceRow: number
  cardNo: string
  occurredAt: string
  stationName: string
  liters: number | null
  amount: number
  rawRow: Record<string, unknown>
}

export interface FuelStatementBatch {
  id: string
  tenantId: string
  fileName: string
  fileSha256: string
  rowCount: number
  importedAt: string
  matched: number
  difference: number
  unmatched: number
}

export interface FuelStatementRow {
  id: string
  tenantId: string
  batchId: string
  sourceRow: number
  cardNo: string
  occurredAt: string
  stationName: string
  liters: number | null
  amount: number
  matchStatus: FuelStatementMatchStatus
  matchedEntryId: string | null
  ledgerAmount: number | null
  amountDifference: number | null
  ledgerOccurredAt: string | null
  ledgerStationName: string | null
  ledgerLiters: number | null
  reconciledAt: string | null
}

export interface FuelStatementResult {
  batchId: string
  matched: number
  difference: number
  unmatched: number
  duplicate?: boolean
}

const { supabase, responseHandle } = useSupabase()

function requiredText(row: Record<string, unknown>, key: string): string {
  if (typeof row[key] !== 'string') throw new Error('对账结果格式异常，请重新加载')
  return row[key]
}

function requiredNumber(row: Record<string, unknown>, key: string): number {
  const value = row[key]
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('对账金额格式异常，请重新加载')
  return value
}

function nullableText(row: Record<string, unknown>, key: string): string | null {
  if (row[key] === null) return null
  return requiredText(row, key)
}

function nullableNumber(row: Record<string, unknown>, key: string): number | null {
  if (row[key] === null) return null
  return requiredNumber(row, key)
}

function parseBatch(value: unknown): FuelStatementBatch {
  if (!isPlainObjectRecord(value)) throw new Error('对账批次格式异常，请重新加载')
  return {
    id: requiredText(value, 'id'),
    tenantId: requiredText(value, 'tenantId'),
    fileName: requiredText(value, 'fileName'),
    fileSha256: requiredText(value, 'fileSha256'),
    rowCount: requiredNumber(value, 'rowCount'),
    importedAt: requiredText(value, 'importedAt'),
    matched: requiredNumber(value, 'matched'),
    difference: requiredNumber(value, 'difference'),
    unmatched: requiredNumber(value, 'unmatched')
  }
}

function parseRow(value: unknown): FuelStatementRow {
  if (!isPlainObjectRecord(value)) throw new Error('对账明细格式异常，请重新加载')
  const matchStatus = requiredText(value, 'matchStatus')
  if (matchStatus !== 'matched' && matchStatus !== 'difference' && matchStatus !== 'unmatched')
    throw new Error('对账状态格式异常，请重新加载')
  return {
    id: requiredText(value, 'id'),
    tenantId: requiredText(value, 'tenantId'),
    batchId: requiredText(value, 'batchId'),
    sourceRow: requiredNumber(value, 'sourceRow'),
    cardNo: requiredText(value, 'cardNo'),
    occurredAt: requiredText(value, 'occurredAt'),
    stationName: requiredText(value, 'stationName'),
    liters: nullableNumber(value, 'liters'),
    amount: requiredNumber(value, 'amount'),
    matchStatus,
    matchedEntryId: nullableText(value, 'matchedEntryId'),
    ledgerAmount: nullableNumber(value, 'ledgerAmount'),
    amountDifference: nullableNumber(value, 'amountDifference'),
    ledgerOccurredAt: nullableText(value, 'ledgerOccurredAt'),
    ledgerStationName: nullableText(value, 'ledgerStationName'),
    ledgerLiters: nullableNumber(value, 'ledgerLiters'),
    reconciledAt: nullableText(value, 'reconciledAt')
  }
}

function parseResult(value: unknown): FuelStatementResult {
  if (!isPlainObjectRecord(value)) throw new Error('对账执行结果异常，请重新加载')
  return {
    batchId: requiredText(value, 'batchId'),
    matched: requiredNumber(value, 'matched'),
    difference: requiredNumber(value, 'difference'),
    unmatched: requiredNumber(value, 'unmatched'),
    duplicate: typeof value.duplicate === 'boolean' ? value.duplicate : undefined
  }
}

export async function fetchFuelStatementBatches(): Promise<FuelStatementBatch[]> {
  const result = await responseHandle<unknown>(
    () => supabase.rpc('vms_list_fuel_statement_batches_secure'),
    { breakReturn: true, showErrorMessage: false, errorMessage: '加油站对账批次加载失败，请重试' }
  )
  if (!Array.isArray(result.data)) throw new Error('对账批次格式异常，请重新加载')
  return result.data.map(parseBatch)
}

export async function fetchFuelStatementRows(batchId: string): Promise<FuelStatementRow[]> {
  const result = await responseHandle<unknown>(
    () => supabase.rpc('vms_list_fuel_statement_rows_secure', { p_batch_id: batchId }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '加油站对账明细加载失败，请重试' }
  )
  if (!Array.isArray(result.data)) throw new Error('对账明细格式异常，请重新加载')
  return result.data.map(parseRow)
}

export async function importFuelStatement(input: {
  fileName: string
  fileSha256: string
  rows: FuelStatementImportRow[]
}): Promise<FuelStatementResult> {
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('vms_import_fuel_statement_secure', {
        p_file_name: input.fileName,
        p_sha256: input.fileSha256,
        p_rows: input.rows
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '对账单导入失败，请检查文件后重试' }
  )
  return parseResult(result.data)
}

export async function reconcileFuelStatement(batchId: string): Promise<FuelStatementResult> {
  const result = await responseHandle<unknown>(
    () => supabase.rpc('vms_reconcile_fuel_statement_secure', { p_batch_id: batchId }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '加油站对账失败，请重试' }
  )
  return parseResult(result.data)
}
