import { isPlainObjectRecord } from '@/utils/type-guards'

export interface DriverCompensationRecord {
  id: string
  employeeId: string
  planName: string
  baseAmount: number
  currencyCode: string
  payFrequency: string
  effectiveFrom: string
  effectiveTo: string | null
  status: 'approved'
}

export interface DriverCompensationSummary {
  employeeLinked: boolean
  current: DriverCompensationRecord | null
}

function requiredText(row: Record<string, unknown>, key: string): string {
  const value = row[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('司机薪酬数据不完整，请刷新后重试')
  }
  return value
}

export function parseDriverCompensation(value: unknown): DriverCompensationSummary | null {
  if (value === null) return null
  if (!isPlainObjectRecord(value) || typeof value.employeeLinked !== 'boolean') {
    throw new Error('司机薪酬数据格式异常，请刷新后重试')
  }
  const rawCurrent = value.current
  if (rawCurrent === null) return { employeeLinked: value.employeeLinked, current: null }
  if (!value.employeeLinked || !isPlainObjectRecord(rawCurrent)) {
    throw new Error('司机薪酬关联数据异常，请刷新后重试')
  }
  if (
    typeof rawCurrent.baseAmount !== 'number' ||
    !Number.isFinite(rawCurrent.baseAmount) ||
    rawCurrent.baseAmount < 0
  ) {
    throw new Error('司机薪酬金额格式异常，请刷新后重试')
  }
  const effectiveTo = rawCurrent.effectiveTo
  if (effectiveTo !== null && typeof effectiveTo !== 'string') {
    throw new Error('司机薪酬日期格式异常，请刷新后重试')
  }
  if (rawCurrent.status !== 'approved') {
    throw new Error('司机薪酬状态异常，请刷新后重试')
  }
  return {
    employeeLinked: true,
    current: {
      id: requiredText(rawCurrent, 'id'),
      employeeId: requiredText(rawCurrent, 'employeeId'),
      planName: requiredText(rawCurrent, 'planName'),
      baseAmount: rawCurrent.baseAmount,
      currencyCode: requiredText(rawCurrent, 'currencyCode'),
      payFrequency: requiredText(rawCurrent, 'payFrequency'),
      effectiveFrom: requiredText(rawCurrent, 'effectiveFrom'),
      effectiveTo,
      status: 'approved'
    }
  }
}
