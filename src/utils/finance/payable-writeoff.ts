import type { PayableReference, PayableWriteoffRelation } from '@/api/payable-reference'
import { payableSchemeApplies, payableSchemeRules } from './payable-match'
import { groupBy, isEqual, keyBy, pick, sumBy } from 'lodash-es'
import { formatCurrencyValue } from '@/utils/ui/format'
import { roundPayable } from './payable'
import { isMaskedValue, parseReadableSensitiveNumber } from '@/utils/field-permission'

export function payableWriteoffSourceTitles(relation?: PayableWriteoffRelation) {
  if (relation === 'payable_refund')
    return { primary: '红字财务应付单', secondary: '供应商退款收款单' }
  if (relation === 'payable_red_blue')
    return { primary: '蓝字财务应付单', secondary: '红字财务应付单' }
  if (relation === 'payment_refund') return { primary: '付款单', secondary: '付款退款单' }
  return {
    primary: '财务应付单',
    secondary: relation === 'payable_receivable' ? '财务应收单' : '付款单'
  }
}

export function preferredPayableWriteoffScheme(
  schemes: PayableReference[],
  relation: PayableWriteoffRelation,
  tenantId?: string
): string {
  const eligible = schemes.filter(
    (scheme) =>
      scheme.id &&
      scheme.enabled &&
      payableSchemeApplies(scheme, relation) &&
      !scheme.automatic &&
      (!tenantId || scheme.tenantId === tenantId)
  )
  const code = relation === 'payable_receivable' ? 'AP-AR-MANUAL' : 'AP-MANUAL'
  return (
    eligible.find((scheme) => scheme.code === code)?.id ||
    eligible.find((scheme) => {
      const governed = payableSchemeRules(scheme, relation)?.some(
        (rule) => rule.primaryField === 'counterparty_id'
      )
      return relation === 'payable_receivable' ? governed : !governed
    })?.id ||
    ''
  )
}

export interface WriteoffAmountRow {
  id: string
  availableAmount: number
  writeoffAmount?: number
  sourcePayableId?: string
  sameSourceOnly?: boolean
}
export function payableWriteoffUsesBookAmounts(relation?: PayableWriteoffRelation): boolean {
  return [
    'payable_payment',
    'payment_refund',
    'payable_receivable',
    'payable_red_blue',
    'payable_refund'
  ].includes(relation || 'payable_payment')
}

export function payableWriteoffMoneyFields(relation?: PayableWriteoffRelation) {
  return {
    secondaryAmount:
      relation === 'payable_receivable'
        ? 'receivableAmount'
        : relation === 'payment_refund'
          ? 'refundAmount'
          : relation === 'payable_red_blue'
            ? 'creditAmount'
            : relation === 'payable_refund'
              ? 'receiptAmount'
              : 'paymentFaceAmount',
    primaryBaseAmount: relation === 'payment_refund' ? 'paymentBaseAmount' : 'payableBaseAmount',
    secondaryBaseAmount:
      relation === 'payable_receivable'
        ? 'receivableBaseAmount'
        : relation === 'payment_refund'
          ? 'refundBaseAmount'
          : relation === 'payable_red_blue'
            ? 'creditBaseAmount'
            : relation === 'payable_refund'
              ? 'receiptBaseAmount'
              : 'paymentBaseAmount',
    positiveDifference: relation === 'payable_refund' ? ('loss' as const) : ('gain' as const)
  } as const
}

interface WriteoffMoneySource {
  amount: number
  currencyCode?: string
  secondaryCurrencyCode?: string
  paymentFaceAmount?: unknown
  paymentAmount?: unknown
  cashDiscountAmount?: unknown
  receivableAmount?: unknown
  refundAmount?: unknown
  creditAmount?: unknown
  receiptAmount?: unknown
  payableBaseAmount?: unknown
  paymentBaseAmount?: unknown
  cashDiscountBaseAmount?: unknown
  receivableBaseAmount?: unknown
  refundBaseAmount?: unknown
  creditBaseAmount?: unknown
  receiptBaseAmount?: unknown
}

function sumReadableWriteoffAmounts(values: unknown[]): number | string | undefined {
  if (values.some(isMaskedValue)) return '***'
  const amounts = values.map(parseReadableSensitiveNumber)
  if (amounts.some((value) => value === undefined)) return undefined
  return roundPayable(sumBy(amounts, (value) => value ?? 0))
}

export function payableWriteoffMoneyValues(
  row: WriteoffMoneySource,
  relation?: PayableWriteoffRelation
): { secondaryAmount: unknown; primaryBaseAmount: unknown; secondaryBaseAmount: unknown } {
  const fields = payableWriteoffMoneyFields(relation)
  if (!relation || relation === 'payable_payment') {
    const legacyEqualFace =
      row.paymentAmount === undefined &&
      row.cashDiscountAmount === undefined &&
      (row.currencyCode || 'CNY') === (row.secondaryCurrencyCode || row.currencyCode || 'CNY')
    return {
      secondaryAmount:
        row.paymentFaceAmount ??
        (legacyEqualFace
          ? row.amount
          : sumReadableWriteoffAmounts([row.paymentAmount, row.cashDiscountAmount])),
      primaryBaseAmount: row.payableBaseAmount,
      secondaryBaseAmount: sumReadableWriteoffAmounts([
        row.paymentBaseAmount,
        row.cashDiscountBaseAmount
      ])
    }
  }
  return {
    secondaryAmount: row[fields.secondaryAmount],
    primaryBaseAmount: row[fields.primaryBaseAmount],
    secondaryBaseAmount: row[fields.secondaryBaseAmount]
  }
}
function writeoffCents(row: WriteoffAmountRow): number {
  const value = row.writeoffAmount ?? row.availableAmount
  if (!Number.isFinite(value) || value <= 0 || value > row.availableAmount)
    throw new Error('本次核销金额须大于零，且不能超过允许核销金额')
  if (value !== roundPayable(value)) throw new Error('本次核销金额最多保留两位小数')
  return Math.round(value * 100)
}

export function restoreWriteoffSelection<Row extends WriteoffAmountRow>(
  previous: Row[],
  current: Row[]
): Row[] {
  const saved = keyBy(previous, 'id')
  const sourceFields = [
    'tenantId',
    'supplierId',
    'counterpartyKey',
    'currencyCode',
    'baseCurrencyCode',
    'accountSetId',
    'exchangeRate',
    'availableAmount',
    'availableBaseAmount',
    'availableCash',
    'availableDiscount',
    'cashDiscount',
    'sourcePayableId',
    'sameSourceOnly',
    'matchValues'
  ]
  return current.filter((row) => {
    const original = saved[row.id]
    if (!original || !isEqual(pick(original, sourceFields), pick(row, sourceFields))) return false
    const amount = original.writeoffAmount ?? original.availableAmount
    if (!Number.isFinite(amount) || amount <= 0 || amount > row.availableAmount) return false
    row.writeoffAmount = amount
    return true
  })
}

export function formatPayableCurrencyTotals<T extends { currencyCode?: string }>(
  rows: T[],
  getAmount: (row: T) => unknown
): string {
  const groups = groupBy(rows, (row) => row.currencyCode || 'CNY')
  const totals = Object.entries(groups).map(([currency, records]) => {
    const values = records.map(getAmount)
    const amounts = values.map(parseReadableSensitiveNumber)
    if (amounts.some((value) => value === undefined))
      return values.some(isMaskedValue) ? '***' : '--'
    const formatted = formatCurrencyValue(
      roundPayable(sumBy(amounts, (value) => value ?? 0)),
      currency
    )
    return currency === 'CNY' ? formatted : `${currency} ${formatted}`
  })
  return totals.join(' · ') || formatCurrencyValue(0)
}

export function formatPayableExchangeDifference(
  value?: unknown,
  currency = 'CNY',
  positive: 'gain' | 'loss' = 'gain'
): string {
  const amount = parseReadableSensitiveNumber(value)
  if (amount === undefined) return isMaskedValue(value) ? '***' : '--'
  return amount
    ? `${amount > 0 === (positive === 'gain') ? '收益' : '损失'} ${formatCurrencyValue(Math.abs(amount), currency)}`
    : '—'
}

export function allocatePayableBookAmounts(
  primary: Array<WriteoffAmountRow & { currencyCode: string; accountSetId?: string }>,
  secondary: Array<WriteoffAmountRow & { currencyCode: string; accountSetId?: string }>,
  relation: PayableWriteoffRelation = 'payable_red_blue'
): Array<{ primaryId: string; secondaryId: string; amount: number; secondaryAmount: number }> {
  const titles = payableWriteoffSourceTitles(relation)
  if (!primary.length || !secondary.length)
    throw new Error(`请分别选择${titles.primary}与${titles.secondary}`)
  if (
    primary.length === 1 &&
    secondary.length === 1 &&
    primary[0].accountSetId &&
    secondary[0].accountSetId &&
    primary[0].accountSetId !== secondary[0].accountSetId
  )
    throw new Error('核销双方不能跨账套，请重新选择来源')
  if (
    primary.length === 1 &&
    secondary.length === 1 &&
    primary[0].currencyCode !== secondary[0].currencyCode
  ) {
    if (primary[0].sameSourceOnly || secondary[0].sameSourceOnly)
      throw new Error('运输同源结算暂不支持异币手工核销，请核对原来源币种')
    return [
      {
        primaryId: primary[0].id,
        secondaryId: secondary[0].id,
        amount: writeoffCents(primary[0]) / 100,
        secondaryAmount: writeoffCents(secondary[0]) / 100
      }
    ]
  }
  const grouping = (row: { currencyCode: string; accountSetId?: string }) =>
    `${row.accountSetId || ''}:${row.currencyCode}`
  const mainGroups = groupBy(primary, grouping)
  const sideGroups = groupBy(secondary, grouping)
  if (
    Object.keys(mainGroups).length !== Object.keys(sideGroups).length ||
    Object.keys(mainGroups).some((currency) => !sideGroups[currency])
  )
    throw new Error(
      `同账套同币种请分别核对金额；异币手工核销请每次选择一张${titles.primary}与一张${titles.secondary}，并明确双方原币金额`
    )
  return Object.entries(mainGroups).flatMap(([currency, main]) =>
    allocateWriteoffAmounts(main, sideGroups[currency]).map((pair) => ({
      ...pair,
      secondaryAmount: pair.amount
    }))
  )
}

/** Legacy red-blue caller contract; allocation policy is owned by the book-aware implementation. */
export function allocatePayableRedBlueAmounts(
  primary: Array<WriteoffAmountRow & { currencyCode: string; accountSetId?: string }>,
  secondary: Array<WriteoffAmountRow & { currencyCode: string; accountSetId?: string }>
): Array<{ primaryId: string; secondaryId: string; amount: number; creditAmount: number }> {
  return allocatePayableBookAmounts(primary, secondary, 'payable_red_blue').map(
    ({ secondaryAmount, ...item }) => ({ ...item, creditAmount: secondaryAmount })
  )
}

export function allocateWriteoffAmounts(
  primary: WriteoffAmountRow[],
  secondary: WriteoffAmountRow[]
): Array<{ primaryId: string; secondaryId: string; amount: number }> {
  if (!primary.length || !secondary.length) throw new Error('请分别选择核销主方与辅方明细')
  const main = primary.map((row) => ({
    id: row.id,
    remaining: writeoffCents(row),
    sameSourceOnly: row.sameSourceOnly
  }))
  const side = secondary.map((row) => ({
    id: row.id,
    remaining: writeoffCents(row),
    sourcePayableId: row.sourcePayableId,
    sameSourceOnly: row.sameSourceOnly
  }))
  if (
    main.reduce((sum, row) => sum + row.remaining, 0) !==
    side.reduce((sum, row) => sum + row.remaining, 0)
  )
    throw new Error('主辅方本次核销金额合计须一致，请调整选中行金额')
  const items: Array<{ primaryId: string; secondaryId: string; amount: number }> = []
  const mainById = keyBy(main, 'id')
  for (const payment of side.filter((row) => row.sameSourceOnly)) {
    const source = payment.sourcePayableId ? mainById[payment.sourcePayableId] : undefined
    if (!source) throw new Error('运输非现金结算只能核销原财务应付，请选择对应来源单据')
    if (payment.remaining > source.remaining)
      throw new Error('同源付款的本次核销金额超过对应应付的选择金额，请分别调整')
    items.push({ primaryId: source.id, secondaryId: payment.id, amount: payment.remaining / 100 })
    source.remaining -= payment.remaining
    payment.remaining = 0
  }
  const flexible = side.filter((row) => !row.sameSourceOnly)
  if (main.some((row) => row.sameSourceOnly && row.remaining > 0))
    throw new Error('运输应付请按同源非现金付款的本次金额核销，不能混配其他付款')
  let sideIndex = 0
  for (const row of main) {
    while (row.remaining > 0) {
      const payment = flexible[sideIndex]
      const amount = Math.min(row.remaining, payment.remaining)
      items.push({ primaryId: row.id, secondaryId: payment.id, amount: amount / 100 })
      row.remaining -= amount
      payment.remaining -= amount
      if (!payment.remaining) sideIndex += 1
    }
  }
  return items
}
