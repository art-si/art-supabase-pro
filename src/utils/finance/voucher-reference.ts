import type { PayableWriteoffRecord } from '@/api/payable-writeoff'
import { getFieldAccess, isMaskedValue, isReadableFieldAccess } from '@/utils/field-permission'
import type { FieldAccessMap } from '@/utils/field-permission'

export interface VoucherReferenceSource {
  id?: string
  tenantId?: string
  accountSetId?: string
  sourceType: string
  sourceEventCode?: string | null
  sourceId?: string | null
  sourceNo?: string | null
  fieldAccess?: FieldAccessMap<'sourceReferences'>
}

export interface VoucherBusinessReference {
  key: string
  label: string
  documentNo: string
  routeName?: string
  permission?: string
  query?: Record<string, string>
}

const referencePermissions = {
  FinancePayableWriteoff: 'FinancePayableWriteoff:View',
  FinancePurchasePayable: 'FinancePurchasePayable:View',
  FinanceEstimatedPayable: 'FinanceEstimatedPayable:View',
  FinancePayablePayment: 'FinancePayablePayment:View',
  FinancePayableRefund: 'FinancePayableRefund:View',
  FinanceFinancialReceivable: 'FinanceFinancialReceivable:View',
  FinanceReceipt: 'FinanceReceipt:View',
  FinanceVoucherCenter: 'FinanceVoucherCenter:View'
} as const
type VoucherReferenceRoute = keyof typeof referencePermissions

export function canReadVoucherReferences(source?: VoucherReferenceSource): boolean {
  return isReadableFieldAccess(getFieldAccess(source?.fieldAccess, 'sourceReferences'))
}

export function isPayableWriteoffVoucherSource(source?: VoucherReferenceSource): boolean {
  return Boolean(
    source &&
    canReadVoucherReferences(source) &&
    source.sourceType === 'system' &&
    source.sourceId &&
    !isMaskedValue(source.sourceId) &&
    [
      'ap_writeoff_approved',
      'ap_receivable_offset_approved',
      'ap_red_blue_offset_approved',
      'ap_payable_refund_writeoff_approved'
    ].includes(source.sourceEventCode || '')
  )
}

export function buildVoucherBusinessReferences(
  source?: VoucherReferenceSource,
  writeoff?: PayableWriteoffRecord
): VoucherBusinessReference[] {
  if (!source || !canReadVoucherReferences(source)) return []
  const reference = (
    key: string,
    label: string,
    documentNo: string,
    routeName?: VoucherReferenceRoute,
    id?: string
  ): VoucherBusinessReference => ({
    key,
    label,
    documentNo,
    ...(routeName && id && !isMaskedValue(id)
      ? { routeName, permission: referencePermissions[routeName], query: { recordId: id } }
      : {})
  })
  if (isPayableWriteoffVoucherSource(source) && writeoff) {
    const snapshotBook = writeoff.matchSnapshot?.primary?.accountSetId
    const historicalBook =
      snapshotBook &&
      !isMaskedValue(snapshotBook) &&
      snapshotBook === writeoff.matchSnapshot?.secondary?.accountSetId
        ? snapshotBook
        : undefined
    const sourceBook = writeoff.accountSetId || historicalBook
    if (
      writeoff.id !== source.sourceId ||
      !source.accountSetId ||
      sourceBook !== source.accountSetId ||
      (source.tenantId && writeoff.tenantId !== source.tenantId)
    )
      throw new Error('凭证关联资料与当前来源不一致，请刷新重试')
    const records: VoucherBusinessReference[] = [
      {
        ...reference(
          'writeoff',
          '核销记录',
          writeoff.recordNo,
          'FinancePayableWriteoff',
          writeoff.id
        ),
        query: { recordId: writeoff.id, relation: writeoff.relation || 'payable_payment' }
      },
      reference(
        'primary',
        writeoff.relation === 'payment_refund' ? '付款单' : '财务应付单',
        writeoff.payableNo,
        writeoff.relation === 'payment_refund' ? 'FinancePayablePayment' : 'FinancePurchasePayable',
        (writeoff.relation === 'payment_refund'
          ? writeoff.paymentDocumentId
          : writeoff.payableId) || undefined
      ),
      reference(
        'secondary',
        {
          payable_payment: '付款单',
          payment_refund: '付款退款单',
          payable_receivable: '财务应收单',
          payable_red_blue: '红字财务应付单',
          payable_refund: '供应商退款收款单'
        }[writeoff.relation || 'payable_payment'],
        writeoff.paymentNo,
        (
          {
            payable_payment: 'FinancePayablePayment',
            payment_refund: 'FinancePayableRefund',
            payable_receivable: 'FinanceFinancialReceivable',
            payable_red_blue: 'FinancePurchasePayable',
            payable_refund: 'FinanceReceipt'
          } as const
        )[writeoff.relation || 'payable_payment'],
        {
          payable_payment: writeoff.paymentDocumentId,
          payment_refund: writeoff.refundDocumentId,
          payable_receivable: writeoff.receivableDocumentId,
          payable_red_blue: writeoff.creditPayableId,
          payable_refund: writeoff.receiptId
        }[writeoff.relation || 'payable_payment'] || undefined
      )
    ]
    return records.filter((row) => Boolean(row.documentNo))
  }
  if (!source.sourceNo || isMaskedValue(source.sourceNo)) return []
  const directSources: Record<string, { label: string; routeName: VoucherReferenceRoute }> = {
    estimated_payable: { label: '暂估应付单', routeName: 'FinanceEstimatedPayable' },
    financial_payable: { label: '财务应付单', routeName: 'FinancePurchasePayable' },
    reversal: { label: '原会计凭证', routeName: 'FinanceVoucherCenter' }
  }
  const direct = directSources[source.sourceType]
  return [
    reference(
      'source',
      direct?.label || '来源单据',
      source.sourceNo,
      direct?.routeName,
      source.sourceId || undefined
    )
  ]
}
