import { isPlainObjectRecord } from '@/utils/type-guards'

export interface MainlineCostRecord {
  id: string
  costNo: string | null
  waybillId: string
  waybillNoSnapshot: string | null
  orderNoSnapshot: string | null
  plateNoSnapshot: string | null
  driverNameSnapshot: string | null
  costType: string | null
  expenseItemName: string | null
  amount: number | string | null
  occurredOn: string | null
  auditStatus: string | null
  settlementStatus: string | null
}

export interface VehicleFuelExecution {
  waybillId: string
  waybillNo: string
  status: string
  departedAt: string | null
  completedAt: string | null
  departureOdometerKm: number | null
  returnOdometerKm: number | null
  emptyMileageKm: number | null
  departureFuelLiters: number | null
  refueledLiters: number | null
  returnFuelLiters: number | null
  consumedFuelLiters: number | null
  totalMileageKm: number | null
  fuelPer100km: number | null
}

export interface MainlinePage<T> {
  data: T[]
  total: number
}

function requiredText(row: Record<string, unknown>, key: string): string {
  const value = row[key]
  if (typeof value !== 'string' || !value) throw new Error('主线运营记录不完整，请刷新后重试')
  return value
}

function nullableText(row: Record<string, unknown>, key: string): string | null {
  const value = row[key]
  if (value == null) return null
  if (typeof value !== 'string') throw new Error('主线运营记录格式异常，请刷新后重试')
  return value
}

function nullableNumber(row: Record<string, unknown>, key: string): number | null {
  const value = row[key]
  if (value == null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('主线运营数值异常，请刷新后重试')
  }
  return value
}

function parsePage<T>(
  value: unknown,
  parseRow: (row: Record<string, unknown>) => T
): MainlinePage<T> {
  if (!isPlainObjectRecord(value) || !Array.isArray(value.records)) {
    throw new Error('主线运营查询结果异常，请刷新后重试')
  }
  if (typeof value.total !== 'number' || !Number.isSafeInteger(value.total) || value.total < 0) {
    throw new Error('主线运营查询总数异常，请刷新后重试')
  }
  return {
    data: value.records.map((item: unknown) => {
      if (!isPlainObjectRecord(item)) throw new Error('主线运营记录格式异常，请刷新后重试')
      return parseRow(item)
    }),
    total: value.total
  }
}

export function parseMainlineCosts(value: unknown): MainlinePage<MainlineCostRecord> {
  return parsePage(value, (row) => {
    const amount = row.amount
    if (amount != null && typeof amount !== 'string' && typeof amount !== 'number') {
      throw new Error('主线费用金额格式异常，请刷新后重试')
    }
    const expenseItem = isPlainObjectRecord(row.expenseItem) ? row.expenseItem : null
    return {
      id: requiredText(row, 'id'),
      costNo: nullableText(row, 'costNo'),
      waybillId: requiredText(row, 'waybillId'),
      waybillNoSnapshot: nullableText(row, 'waybillNoSnapshot'),
      orderNoSnapshot: nullableText(row, 'orderNoSnapshot'),
      plateNoSnapshot: nullableText(row, 'plateNoSnapshot'),
      driverNameSnapshot: nullableText(row, 'driverNameSnapshot'),
      costType: nullableText(row, 'costType'),
      expenseItemName: expenseItem ? nullableText(expenseItem, 'itemName') : null,
      amount: amount ?? null,
      occurredOn: nullableText(row, 'occurredOn'),
      auditStatus: nullableText(row, 'auditStatus'),
      settlementStatus: nullableText(row, 'settlementStatus')
    }
  })
}

export function parseVehicleFuelExecutions(value: unknown): MainlinePage<VehicleFuelExecution> {
  return parsePage(value, (row) => ({
    waybillId: requiredText(row, 'waybillId'),
    waybillNo: requiredText(row, 'waybillNo'),
    status: requiredText(row, 'status'),
    departedAt: nullableText(row, 'departedAt'),
    completedAt: nullableText(row, 'completedAt'),
    departureOdometerKm: nullableNumber(row, 'departureOdometerKm'),
    returnOdometerKm: nullableNumber(row, 'returnOdometerKm'),
    emptyMileageKm: nullableNumber(row, 'emptyMileageKm'),
    departureFuelLiters: nullableNumber(row, 'departureFuelLiters'),
    refueledLiters: nullableNumber(row, 'refueledLiters'),
    returnFuelLiters: nullableNumber(row, 'returnFuelLiters'),
    consumedFuelLiters: nullableNumber(row, 'consumedFuelLiters'),
    totalMileageKm: nullableNumber(row, 'totalMileageKm'),
    fuelPer100km: nullableNumber(row, 'fuelPer100km')
  }))
}
