import { isPlainObjectRecord } from '@/utils/type-guards'
import {
  parseMainlineCosts,
  type MainlineCostRecord,
  type MainlinePage
} from './mainline-operating.model'

export interface OrderMainlineCostRecord extends MainlineCostRecord {
  shared: boolean
  linkedOrderCount: number
}

export function parseOrderMainlineCosts(value: unknown): MainlinePage<OrderMainlineCostRecord> {
  const page = parseMainlineCosts(value)
  if (!isPlainObjectRecord(value) || !Array.isArray(value.records)) {
    throw new Error('订单费用查询结果异常，请刷新后重试')
  }
  const records: unknown[] = value.records
  return {
    total: page.total,
    data: page.data.map((row, index) => {
      const raw = records[index]
      if (
        !isPlainObjectRecord(raw) ||
        typeof raw.shared !== 'boolean' ||
        typeof raw.linkedOrderCount !== 'number' ||
        !Number.isSafeInteger(raw.linkedOrderCount) ||
        raw.linkedOrderCount < 1 ||
        raw.shared !== raw.linkedOrderCount > 1
      ) {
        throw new Error('订单费用关联信息异常，请刷新后重试')
      }
      return { ...row, shared: raw.shared, linkedOrderCount: raw.linkedOrderCount }
    })
  }
}
