import { isPlainObjectRecord } from '@/utils/type-guards'

export interface OrderStatementLine {
  id: string
  statementId: string
  statementNo: string
  status: string
  periodStart: string
  periodEnd: string
  waybillNo: string | null
  isActive: boolean
  lineAmount: number | string | null
}

export interface OrderMainlineException {
  id: string
  exceptionType: string
  stage: string
  description: string
  occurredAt: string
  status: string
  resolutionNote: string | null
}

export interface OrderMainlineFinance {
  statementsAvailable: boolean
  statementTotal: number
  statements: OrderStatementLine[]
  exceptionTotal: number
  exceptions: OrderMainlineException[]
}

function requiredText(row: Record<string, unknown>, key: string): string {
  const value = row[key]
  if (typeof value !== 'string') throw new Error('订单财务数据格式异常，请刷新后重试')
  return value
}

function nullableText(row: Record<string, unknown>, key: string): string | null {
  const value = row[key]
  if (value === null || value === undefined) return null
  return requiredText(row, key)
}

function totalCount(row: Record<string, unknown>, key: string): number {
  const value = row[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('订单财务数据总数异常，请刷新后重试')
  }
  return value
}

export function parseOrderMainlineFinance(value: unknown): OrderMainlineFinance | null {
  if (value === null) return null
  if (
    !isPlainObjectRecord(value) ||
    !Array.isArray(value.statements) ||
    !Array.isArray(value.exceptions)
  ) {
    throw new Error('订单财务数据格式异常，请刷新后重试')
  }
  if (typeof value.statementsAvailable !== 'boolean') {
    throw new Error('订单财务授权状态异常，请刷新后重试')
  }
  if (!value.statementsAvailable && (value.statements.length > 0 || value.statementTotal !== 0)) {
    throw new Error('订单财务授权状态异常，请刷新后重试')
  }
  const statements = value.statements.map((item: unknown): OrderStatementLine => {
    if (!isPlainObjectRecord(item) || typeof item.isActive !== 'boolean') {
      throw new Error('订单对账数据格式异常，请刷新后重试')
    }
    const amount = item.lineAmount
    if (
      amount !== null &&
      amount !== undefined &&
      typeof amount !== 'number' &&
      typeof amount !== 'string'
    ) {
      throw new Error('订单对账金额格式异常，请刷新后重试')
    }
    return {
      id: requiredText(item, 'id'),
      statementId: requiredText(item, 'statementId'),
      statementNo: requiredText(item, 'statementNo'),
      status: requiredText(item, 'status'),
      periodStart: requiredText(item, 'periodStart'),
      periodEnd: requiredText(item, 'periodEnd'),
      waybillNo: nullableText(item, 'waybillNo'),
      isActive: item.isActive,
      lineAmount: amount ?? null
    }
  })
  const exceptions = value.exceptions.map((item: unknown): OrderMainlineException => {
    if (!isPlainObjectRecord(item)) throw new Error('订单异常数据格式异常，请刷新后重试')
    return {
      id: requiredText(item, 'id'),
      exceptionType: requiredText(item, 'exceptionType'),
      stage: requiredText(item, 'stage'),
      description: requiredText(item, 'description'),
      occurredAt: requiredText(item, 'occurredAt'),
      status: requiredText(item, 'status'),
      resolutionNote: nullableText(item, 'resolutionNote')
    }
  })
  return {
    statementsAvailable: value.statementsAvailable,
    statementTotal: totalCount(value, 'statementTotal'),
    statements,
    exceptionTotal: totalCount(value, 'exceptionTotal'),
    exceptions
  }
}
