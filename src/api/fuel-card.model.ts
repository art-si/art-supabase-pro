import { isPlainObjectRecord } from '@/utils/type-guards'
import type {
  FuelCard,
  FuelCardEntry,
  FuelCardEntryType,
  FuelCardFuelType,
  FuelCardPaymentMethod,
  FuelCardStatus
} from './fuel-card'

function parsePage<T>(
  value: unknown,
  parseRow: (row: Record<string, unknown>) => T
): {
  data: T[]
  total: number
} {
  if (!isPlainObjectRecord(value) || !Array.isArray(value.records)) {
    throw new Error('油卡查询结果格式异常，请刷新后重试')
  }
  const total = value.total
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) {
    throw new Error('油卡查询总数格式异常，请刷新后重试')
  }
  return {
    data: value.records.map((row) => {
      if (!isPlainObjectRecord(row)) throw new Error('油卡记录格式异常，请刷新后重试')
      return parseRow(row)
    }),
    total
  }
}

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key]
  if (typeof value !== 'string') throw new Error('油卡记录格式异常，请刷新后重试')
  return value
}

function number(row: Record<string, unknown>, key: string): number {
  const value = row[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('油卡金额格式异常，请刷新后重试')
  }
  return value
}

function nullableText(row: Record<string, unknown>, key: string): string | null {
  const value = row[key]
  if (value === null) return null
  if (typeof value !== 'string') throw new Error('油卡记录格式异常，请刷新后重试')
  return value
}

function nullableNumber(row: Record<string, unknown>, key: string): number | null {
  if (row[key] === null) return null
  return number(row, key)
}

function cardStatus(value: string): FuelCardStatus {
  if (value !== 'active' && value !== 'lost' && value !== 'disabled') {
    throw new Error('油卡状态格式异常，请刷新后重试')
  }
  return value
}

function fuelType(value: string): FuelCardFuelType {
  if (value !== 'diesel_0' && value !== 'gasoline_92') {
    throw new Error('油品格式异常，请刷新后重试')
  }
  return value
}

function paymentMethod(value: string | null): FuelCardPaymentMethod | null {
  if (value === null || value === 'fuel_card') {
    return value
  }
  throw new Error('支付方式格式异常，请刷新后重试')
}

function parseCard(row: Record<string, unknown>): FuelCard {
  const status = cardStatus(text(row, 'status'))
  return {
    id: text(row, 'id'),
    tenantId: text(row, 'tenantId'),
    cardNo: text(row, 'cardNo'),
    vehicleId: text(row, 'vehicleId'),
    plateNo: text(row, 'plateNo'),
    companyName: nullableText(row, 'companyName'),
    issuer: text(row, 'issuer'),
    imagePath: nullableText(row, 'imagePath'),
    fuelType: fuelType(text(row, 'fuelType')),
    ownerEmployeeId: nullableText(row, 'ownerEmployeeId'),
    ownerEmployeeName: nullableText(row, 'ownerEmployeeName'),
    openerEmployeeId: nullableText(row, 'openerEmployeeId'),
    openerEmployeeName: nullableText(row, 'openerEmployeeName'),
    driverId: nullableText(row, 'driverId'),
    driverName: nullableText(row, 'driverName'),
    remark: text(row, 'remark'),
    status,
    balance: number(row, 'balance'),
    createTime: text(row, 'createTime'),
    updateTime: text(row, 'updateTime')
  }
}

function parseEntry(row: Record<string, unknown>): FuelCardEntry {
  const entryType = text(row, 'entryType')
  if (!['opening', 'recharge', 'consume', 'reversal'].includes(entryType)) {
    throw new Error('油卡流水类型格式异常，请刷新后重试')
  }
  const reversalId = row.reversesEntryId
  if (reversalId !== null && typeof reversalId !== 'string') {
    throw new Error('油卡冲正记录格式异常，请刷新后重试')
  }
  if (typeof row.isReversed !== 'boolean') {
    throw new Error('油卡冲正状态格式异常，请刷新后重试')
  }
  if (
    !Array.isArray(row.voucherPaths) ||
    !row.voucherPaths.every((value) => typeof value === 'string')
  ) {
    throw new Error('油卡凭证格式异常，请刷新后重试')
  }
  return {
    id: text(row, 'id'),
    tenantId: text(row, 'tenantId'),
    cardId: text(row, 'cardId'),
    cardNo: text(row, 'cardNo'),
    vehicleId: text(row, 'vehicleId'),
    plateNo: text(row, 'plateNo'),
    companyName: nullableText(row, 'companyName'),
    cardStatus: cardStatus(text(row, 'cardStatus')),
    driverId: nullableText(row, 'driverId'),
    driverName: nullableText(row, 'driverName'),
    stationName: text(row, 'stationName'),
    liters: nullableNumber(row, 'liters'),
    unitPrice: nullableNumber(row, 'unitPrice'),
    paymentMethod: paymentMethod(nullableText(row, 'paymentMethod')),
    voucherPaths: row.voucherPaths,
    sourceCostId: nullableText(row, 'sourceCostId'),
    sourceCostNo: nullableText(row, 'sourceCostNo'),
    cardBalance: number(row, 'cardBalance'),
    rechargeChannel: text(row, 'rechargeChannel'),
    invoiceNo: text(row, 'invoiceNo'),
    rechargerEmployeeId: nullableText(row, 'rechargerEmployeeId'),
    rechargerEmployeeName: nullableText(row, 'rechargerEmployeeName'),
    waybillId: nullableText(row, 'waybillId'),
    waybillNo: nullableText(row, 'waybillNo'),
    occurredAt: nullableText(row, 'occurredAt'),
    expenseLocation: text(row, 'expenseLocation'),
    expenseLongitude: nullableNumber(row, 'expenseLongitude'),
    expenseLatitude: nullableNumber(row, 'expenseLatitude'),
    expenseCoordinateSystem: nullableText(row, 'expenseCoordinateSystem'),
    expenseCoordinateSource: nullableText(row, 'expenseCoordinateSource'),
    expenseCoordinateStatus: text(row, 'expenseCoordinateStatus'),
    expenseGeocodeProvider: nullableText(row, 'expenseGeocodeProvider'),
    expenseGeocodedAt: nullableText(row, 'expenseGeocodedAt'),
    odometerKm: nullableNumber(row, 'odometerKm'),
    tripFuelPer100Km: nullableNumber(row, 'tripFuelPer100Km'),
    entryType: entryType as FuelCardEntryType,
    amount: number(row, 'amount'),
    signedAmount: number(row, 'signedAmount'),
    balanceAfter: number(row, 'balanceAfter'),
    occurredOn: text(row, 'occurredOn'),
    referenceNo: text(row, 'referenceNo'),
    remark: text(row, 'remark'),
    reversesEntryId: reversalId,
    isReversed: row.isReversed,
    createTime: text(row, 'createTime')
  }
}

/** Parse the deep camel-case JSON returned by responseHandle. */
export function parseFuelCardPage(value: unknown) {
  return parsePage(value, parseCard)
}

/** Parse the deep camel-case JSON returned by responseHandle. */
export function parseFuelCardLedgerPage(value: unknown) {
  return parsePage(value, parseEntry)
}
