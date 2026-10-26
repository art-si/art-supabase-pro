import { isPlainObjectRecord } from '@/utils/type-guards'
import type { FuelCard, FuelCardEntry, FuelCardEntryType } from './fuel-card'

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

function parseCard(row: Record<string, unknown>): FuelCard {
  const status = text(row, 'status')
  if (status !== 'active' && status !== 'disabled') {
    throw new Error('油卡状态格式异常，请刷新后重试')
  }
  return {
    id: text(row, 'id'),
    tenantId: text(row, 'tenantId'),
    cardNo: text(row, 'cardNo'),
    vehicleId: text(row, 'vehicleId'),
    plateNo: text(row, 'plateNo'),
    issuer: text(row, 'issuer'),
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
  return {
    id: text(row, 'id'),
    tenantId: text(row, 'tenantId'),
    cardId: text(row, 'cardId'),
    cardNo: text(row, 'cardNo'),
    vehicleId: text(row, 'vehicleId'),
    plateNo: text(row, 'plateNo'),
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
