import dayjs from 'dayjs'
import type {
  PayableSettlementDocument,
  PayableSettlementKind,
  PayableSettlementLine
} from '@/api/payable-settlement.types'

export const payablePurposeBusinessTypeOptions = [
  { value: 'purchase', label: '采购付款' },
  { value: 'advance', label: '预付款' },
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
      (!line.supplierId && !line.carrierId) ||
      (!line.payeeSupplierId && !line.carrierId) ||
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
