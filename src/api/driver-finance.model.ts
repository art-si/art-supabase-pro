import { isPlainObjectRecord } from '@/utils/type-guards'

export type DriverFinanceKind = 'waybill_cost' | 'loan' | 'repayment' | 'reimbursement'

export interface DriverFinanceRecord {
  id: string
  kind: DriverFinanceKind
  no: string | null
  occurredOn: string | null
  status: string | null
  amount: number | string | null
  waybillId: string | null
  waybillNo: string | null
  orderNo: string | null
  costType: string | null
  reason: string | null
  remark: string | null
  relatedNo: string | null
  settlementStatus: string | null
}

export interface DriverFinancePage {
  records: DriverFinanceRecord[]
  total: number
}

function nullableText(row: Record<string, unknown>, key: string): string | null {
  const value = row[key]
  if (value == null) return null
  if (typeof value !== 'string') throw new Error('司机费用记录格式异常，请刷新后重试')
  return value
}

export function parseDriverFinancePage(value: unknown, kind: DriverFinanceKind): DriverFinancePage {
  if (!isPlainObjectRecord(value) || !Array.isArray(value.records)) {
    throw new Error('司机费用查询结果异常，请刷新后重试')
  }
  if (typeof value.total !== 'number' || !Number.isSafeInteger(value.total) || value.total < 0) {
    throw new Error('司机费用查询总数异常，请刷新后重试')
  }
  return {
    total: value.total,
    records: value.records.map((item: unknown) => {
      if (!isPlainObjectRecord(item) || typeof item.id !== 'string' || !item.id) {
        throw new Error('司机费用记录格式异常，请刷新后重试')
      }
      const amount = item.amount
      if (amount != null && typeof amount !== 'number' && typeof amount !== 'string') {
        throw new Error('司机费用金额格式异常，请刷新后重试')
      }
      return {
        id: item.id,
        kind,
        no: nullableText(item, 'no'),
        occurredOn: nullableText(item, 'occurredOn'),
        status: nullableText(item, 'status'),
        amount: amount ?? null,
        waybillId: nullableText(item, 'waybillId'),
        waybillNo: nullableText(item, 'waybillNo'),
        orderNo: nullableText(item, 'orderNo'),
        costType: nullableText(item, 'costType'),
        reason: nullableText(item, 'reason'),
        remark: nullableText(item, 'remark'),
        relatedNo: nullableText(item, 'relatedNo'),
        settlementStatus: nullableText(item, 'settlementStatus')
      }
    })
  }
}
