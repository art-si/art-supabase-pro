import dayjs from 'dayjs'
import { uniq } from 'lodash-es'
import type {
  PayableSettlementDocument,
  PayableSettlementKind,
  PayableSettlementLine,
  PayableSettlementOption,
  PayableSettlementOptions
} from '@/api/payable-settlement.types'

function settlementAccountSetConstraints(
  document: PayableSettlementDocument,
  options: PayableSettlementOptions,
  line: PayableSettlementLine
): string[] {
  return uniq(
    [
      document.accountSetId,
      ...document.lines.flatMap((row) => [
        row.accountSetId,
        options.payable.find((source) => source.id === row.payableId)?.accountSetId,
        options.purchase.find((source) => source.id === row.purchaseId)?.accountSetId,
        options.receivable?.find((source) => source.id === row.receivableLineId)?.accountSetId,
        row === line
          ? undefined
          : options.fund.find((account) => account.id === row.fundAccountId)?.accountSetId
      ])
    ].filter((value): value is string => Boolean(value))
  )
}

export function settlementFundAccountOptions(
  document: PayableSettlementDocument,
  options: PayableSettlementOptions,
  line: PayableSettlementLine
): PayableSettlementOption[] {
  const books = settlementAccountSetConstraints(document, options, line)
  const method = options.method.find((option) => option.id === line.settlementMethodId)
  return options.fund.filter(
    (option) =>
      option.currencyCode === document.currencyCode &&
      books.every((book) => option.accountSetId === book) &&
      (method?.category === 'cash' ? option.category === 'cash' : option.category !== 'cash')
  )
}

type SettlementSourceContext = Pick<
  PayableSettlementOption,
  'accountSetId' | 'accountSetName' | 'currencyCode'
> & { baseCurrencyCode?: string }

export function settlementSourceConflict(
  document: PayableSettlementDocument,
  options: PayableSettlementOptions,
  line: PayableSettlementLine,
  source: SettlementSourceContext
): string | null {
  if (source.currencyCode && !/^[A-Z]{3}$/.test(source.currencyCode))
    return '来源币种资料无效，请先核对原单或币种配置'
  if (
    source.accountSetId &&
    settlementAccountSetConstraints(document, options, line).some(
      (book) => book !== source.accountSetId
    )
  )
    return '来源与单据或其他明细不属于同一账套，请按账套拆单'
  if (
    source.currencyCode &&
    source.currencyCode !== document.currencyCode &&
    (document.id ||
      document.lines.some(
        (row) =>
          row !== line &&
          (row.payableId ||
            row.purchaseId ||
            row.receivableLineId ||
            row.applicationLineId ||
            row.guaranteePaymentLineId ||
            row.refundPaymentLineId ||
            row.fundAccountId)
      ))
  )
    return '同一单据不能混用来源币种，请先核对单据币种或另建单据'
  return null
}

export function applySettlementSourceContext(
  document: PayableSettlementDocument,
  source: SettlementSourceContext
): void {
  const changed =
    (source.currencyCode && source.currencyCode !== document.currencyCode) ||
    (source.accountSetId && source.accountSetId !== document.accountSetId)
  document.currencyCode = source.currencyCode || document.currencyCode
  document.accountSetId ||= source.accountSetId
  document.accountSetName = source.accountSetName || document.accountSetName
  document.baseCurrencyCode = source.baseCurrencyCode || document.baseCurrencyCode
  if (changed) {
    document.currencyId = null
    document.exchangeRate = null
    document.fxSnapshotVersion = undefined
  }
}

export const payablePurposeBusinessTypeOptions = [
  { value: 'purchase', label: '采购付款' },
  { value: 'advance', label: '预付款' },
  { value: 'guarantee', label: '采购保证金' },
  { value: 'other', label: '其他付款' },
  { value: 'sales_refund', label: '销售退款' },
  { value: 'other_refund', label: '其他退款' },
  { value: 'purchase_refund', label: '退采购付款' },
  { value: 'advance_refund', label: '退预付款' }
]

export const settlementStatusLabels: Record<string, string> = {
  draft: '暂存',
  submitted: '已提交',
  approved: '已审核',
  processing: '付款处理中',
  confirmed: '已确认付款',
  closed: '已关闭',
  cancelled: '已取消'
}
export const settlementPaymentLabels: Record<string, string> = {
  none: '未付款',
  partial: '部分付款',
  full: '全部付款'
}
export const settlementTitles: Record<PayableSettlementKind, string> = {
  application: '付款申请单',
  payment: '付款单',
  refund: '付款退款单'
}
export function settlementStatusLabel(kind: PayableSettlementKind, status: string): string {
  return kind === 'refund' && status === 'confirmed'
    ? '已确认到账'
    : settlementStatusLabels[status] || status
}
export function settlementPaymentLabel(kind: PayableSettlementKind, status: string): string {
  if (kind === 'refund')
    return (
      ({ none: '未到账', partial: '部分到账', full: '全部到账' } as Record<string, string>)[
        status
      ] || status
    )
  return settlementPaymentLabels[status] || status
}
export function newPayableSettlement(kind: PayableSettlementKind): PayableSettlementDocument {
  return {
    id: '',
    documentNo: '',
    kind,
    status: 'draft',
    businessDate: dayjs().format('YYYY-MM-DD'),
    currencyCode: 'CNY',
    reason: '',
    amount: 0,
    frozen: false,
    remark: '',
    version: 0,
    details: { fee: 0, paymentType: 'active' },
    lines: []
  }
}
export function newPayableSettlementLine(lineNo: number): PayableSettlementLine {
  return {
    clientKey: crypto.randomUUID(),
    lineNo,
    purposeId: '',
    amount: 0,
    approvedAmount: 0,
    plannedAmount: 0,
    cashDiscount: 0,
    expiredDiscountAmount: 0,
    taxRate: 0,
    bankAccount: '',
    bankAccountName: '',
    bankName: '',
    bankReference: '',
    fundPurpose: '',
    remark: '',
    details: {}
  }
}
export function validateSettlementAmounts(
  lines: PayableSettlementLine[],
  kind: PayableSettlementKind = 'application'
): string | null {
  if (!lines.length) return '请至少添加一行付款明细'
  for (const [index, line] of lines.entries()) {
    const customerRefund = !!(line.customerId || line.payeeCustomerId || line.receivableLineId)
    if (customerRefund) {
      if (
        !line.customerId ||
        !line.payeeCustomerId ||
        !line.receivableLineId ||
        line.supplierId ||
        line.payeeSupplierId ||
        line.carrierId ||
        line.payableId ||
        line.purchaseId
      )
        return `第 ${index + 1} 行销售退款须完整关联原红字应收客户和收款客户，不能混用供应商来源`
      if (kind === 'payment' && !line.applicationLineId)
        return `第 ${index + 1} 行销售退款付款须从本行的已审核申请下推`
      if (line.cashDiscount !== 0 || line.taxRate !== 0)
        return `第 ${index + 1} 行销售退款按原应收本金付款，不另计现金折扣或税额`
      if (kind === 'refund') return '客户退款付款的回款须恢复原应收流水，不能套用供应商退款'
    }
    if (kind === 'refund' && (!line.refundPaymentLineId || !line.fundAccountId))
      return `第 ${index + 1} 行请选择原付款明细和退款收款账户`
    if (
      kind === 'refund' &&
      (!Number.isFinite(line.expiredDiscountAmount ?? 0) ||
        (line.expiredDiscountAmount ?? 0) < 0 ||
        line.cashDiscount !== 0)
    )
      return `第 ${index + 1} 行失效折扣必须非负，且不能作为现金折扣重复计入退款`
    if (
      !line.purposeId ||
      (!customerRefund && !line.supplierId && !line.carrierId) ||
      (!customerRefund && !line.payeeSupplierId && !line.carrierId) ||
      !line.settlementMethodId
    )
      return `第 ${index + 1} 行请选择付款用途、往来单位、收款单位及结算方式`
    if (
      ![line.amount, line.approvedAmount, line.plannedAmount, line.cashDiscount].every(
        Number.isFinite
      ) ||
      line.amount <= 0 ||
      line.approvedAmount < 0 ||
      line.approvedAmount > line.amount ||
      line.plannedAmount < 0 ||
      line.plannedAmount > line.approvedAmount ||
      line.cashDiscount < 0
    )
      return `第 ${index + 1} 行金额不正确，请核对申请、核准、预计付款及折扣金额`
  }
  return null
}
