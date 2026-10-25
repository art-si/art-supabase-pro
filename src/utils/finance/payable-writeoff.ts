import type { PayableReference } from '@/api/payable-reference'
import type { PayableWriteoffRelation } from '@/api/payable-writeoff'
import { groupBy, sumBy } from 'lodash-es'
import { formatCurrencyValue } from '@/utils/ui/format'
import { roundPayable } from './payable'

export function preferredPayableWriteoffScheme(
  schemes: PayableReference[],
  relation: PayableWriteoffRelation,
  tenantId?: string
): string {
  const eligible = schemes.filter(
    (scheme) =>
      scheme.id &&
      scheme.enabled &&
      !scheme.automatic &&
      (!tenantId || scheme.tenantId === tenantId)
  )
  const code = relation === 'payable_receivable' ? 'AP-AR-MANUAL' : 'AP-MANUAL'
  return (
    eligible.find((scheme) => scheme.code === code)?.id ||
    eligible.find((scheme) => {
      const governed = scheme.rules?.some((rule) => rule.primaryField === 'counterparty_id')
      return relation === 'payable_receivable' ? governed : !governed
    })?.id ||
    ''
  )
}

export interface WriteoffAmountRow {
  id: string
  availableAmount: number
  writeoffAmount?: number
}
function writeoffCents(row: WriteoffAmountRow): number {
  const value = row.writeoffAmount ?? row.availableAmount
  if (!Number.isFinite(value) || value <= 0 || value > row.availableAmount)
    throw new Error('本次核销金额须大于零，且不能超过允许核销金额')
  if (value !== roundPayable(value)) throw new Error('本次核销金额最多保留两位小数')
  return Math.round(value * 100)
}

export function formatPayableCurrencyTotals<T extends { currencyCode?: string }>(
  rows: T[],
  getAmount: (row: T) => number
): string {
  const groups = groupBy(rows, (row) => row.currencyCode || 'CNY')
  const totals = Object.entries(groups).map(([currency, records]) => {
    const formatted = formatCurrencyValue(roundPayable(sumBy(records, getAmount)), currency)
    return currency === 'CNY' ? formatted : `${currency} ${formatted}`
  })
  return totals.join(' · ') || formatCurrencyValue(0)
}

export function formatPayableExchangeDifference(value?: number, currency = 'CNY'): string {
  return value
    ? `${value > 0 ? '收益' : '损失'} ${formatCurrencyValue(Math.abs(value), currency)}`
    : '—'
}

export function allocatePayableRedBlueAmounts(
  primary: Array<WriteoffAmountRow & { currencyCode: string; accountSetId?: string }>,
  secondary: Array<WriteoffAmountRow & { currencyCode: string; accountSetId?: string }>
): Array<{ primaryId: string; secondaryId: string; amount: number; creditAmount: number }> {
  if (!primary.length || !secondary.length) throw new Error('请分别选择蓝字与红字财务应付')
  if (
    primary.length === 1 &&
    secondary.length === 1 &&
    primary[0].accountSetId &&
    secondary[0].accountSetId &&
    primary[0].accountSetId !== secondary[0].accountSetId
  )
    throw new Error('红蓝双方不能跨账套核销，请重新选择来源')
  if (
    primary.length === 1 &&
    secondary.length === 1 &&
    primary[0].currencyCode !== secondary[0].currencyCode
  )
    return [
      {
        primaryId: primary[0].id,
        secondaryId: secondary[0].id,
        amount: writeoffCents(primary[0]) / 100,
        creditAmount: writeoffCents(secondary[0]) / 100
      }
    ]
  const grouping = (row: { currencyCode: string; accountSetId?: string }) =>
    `${row.accountSetId || ''}:${row.currencyCode}`
  const mainGroups = groupBy(primary, grouping)
  const sideGroups = groupBy(secondary, grouping)
  if (
    Object.keys(mainGroups).length !== Object.keys(sideGroups).length ||
    Object.keys(mainGroups).some((currency) => !sideGroups[currency])
  )
    throw new Error(
      '同账套同币种请分别核对金额；异币手工核销请每次选择一张蓝字与一张红字，并明确双方原币金额'
    )
  return Object.entries(mainGroups).flatMap(([currency, main]) =>
    allocateWriteoffAmounts(main, sideGroups[currency]).map((pair) => ({
      ...pair,
      creditAmount: pair.amount
    }))
  )
}

export function allocateWriteoffAmounts(
  primary: WriteoffAmountRow[],
  secondary: WriteoffAmountRow[]
): Array<{ primaryId: string; secondaryId: string; amount: number }> {
  if (!primary.length || !secondary.length) throw new Error('请分别选择核销主方与辅方明细')
  const main = primary.map((row) => ({ id: row.id, remaining: writeoffCents(row) }))
  const side = secondary.map((row) => ({ id: row.id, remaining: writeoffCents(row) }))
  if (
    main.reduce((sum, row) => sum + row.remaining, 0) !==
    side.reduce((sum, row) => sum + row.remaining, 0)
  )
    throw new Error('主辅方本次核销金额合计须一致，请调整选中行金额')
  const items: Array<{ primaryId: string; secondaryId: string; amount: number }> = []
  let sideIndex = 0
  for (const row of main) {
    while (row.remaining > 0) {
      const payment = side[sideIndex]
      const amount = Math.min(row.remaining, payment.remaining)
      items.push({ primaryId: row.id, secondaryId: payment.id, amount: amount / 100 })
      row.remaining -= amount
      payment.remaining -= amount
      if (!payment.remaining) sideIndex += 1
    }
  }
  return items
}
