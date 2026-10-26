import type { PayableSourceKind } from './payable-source.types'

export type PayableSettlementKind = 'application' | 'payment' | 'refund'
export type PayableSettlementAction =
  | 'submit'
  | 'approve'
  | 'confirm'
  | 'cancel_payment'
  | 'freeze'
  | 'unfreeze'
  | 'close'
  | 'delete'
  | 'void'
export interface PayableSettlementPermissions {
  View: string
  Add: string
  Edit: string
  Submit: string
  Approve: string
  Delete: string
  Push?: string
  GuaranteeConvert?: string
  Confirm?: string
  Voucher?: string
  Void?: string
  Freeze?: string
  Close?: string
  Print: string
  Export: string
}
export interface PayableSettlementLine {
  id?: string
  clientKey?: string
  lineNo: number
  purposeId: string
  supplierId?: string | null
  payeeSupplierId?: string | null
  carrierId?: string | null
  customerId?: string | null
  payeeCustomerId?: string | null
  customerName?: string
  payeeCustomerName?: string
  receivableLineId?: string | null
  supplierName?: string
  payeeSupplierName?: string
  supplierCode?: string
  purposeName?: string
  payableId?: string | null
  purchaseId?: string | null
  contractId?: string | null
  contractNo?: string
  applicationLineId?: string | null
  guaranteePaymentLineId?: string | null
  guaranteePaymentDocumentNo?: string
  refundPaymentLineId?: string | null
  refundPaymentDocumentNo?: string
  accountSetId?: string | null
  accountSetName?: string
  currencyCode?: string
  baseCurrencyCode?: string
  expiredDiscountAmount?: number
  availableRefundAmount?: number
  availableRefundDiscount?: number
  sourcePurposeBusinessType?: string
  purposeType?: string
  guaranteeConvertedAmount?: number
  guaranteeAvailableAmount?: number
  projectId?: string | null
  projectName?: string
  departmentId?: string | null
  departmentName?: string
  fundAccountId?: string | null
  fundAccountName?: string
  settlementMethodId?: string | null
  settlementMethodName?: string
  amount: number
  approvedAmount: number
  plannedAmount: number
  cashDiscount: number
  taxRate: number
  taxAmount?: number
  counterpartyBalance?: number | null
  counterpartyBalanceCurrencyCode?: string
  paidAmount?: number
  writtenOffAmount?: number
  unassignedAmount?: number
  bankAccount: string
  bankAccountName: string
  bankName: string
  bankReference: string
  fundPurpose: string
  sourceDocumentNo?: string
  sourceDocumentId?: string | null
  sourceDocumentKind?: PayableSourceKind | null
  remark: string
  details: {
    expenseItemId?: string | null
    employeeId?: string | null
    employeeName?: string
    employeeNo?: string
    sourceLineNo?: string
    sourcePurposeBusinessType?: string
  }
}
export interface PayableSettlementDocument {
  id: string
  tenantId?: string
  tenant?: { tenantName?: string; tenantCode?: string }
  kind: PayableSettlementKind
  recordKey?: string
  documentNo: string
  accountSetId?: string | null
  accountSetName?: string
  documentTypeId?: string
  documentTypeName?: string
  status: string
  businessDate: string
  postingDate?: string
  currencyCode: string
  currencyId?: string | null
  baseCurrencyCode?: string
  exchangeRate?: number | null
  fxSnapshotVersion?: number
  organizationId?: string | null
  organizationName?: string
  applicantName?: string
  counterpartyName?: string
  reason: string
  amount: number
  approvedAmount?: number
  plannedAmount?: number
  paidAmount?: number
  paymentStatus?: string
  frozen: boolean
  remark: string
  version: number
  details: { fee?: number; paymentType?: string; bankConnected?: boolean }
  lines: PayableSettlementLine[]
}
export interface PayableSettlementQuery {
  current: number
  size: number
  id?: string
  keyword?: string
  status?: string
  paymentStatus?: string
  documentTypeId?: string
  businessDateRange?: string[]
  viewMode?: string
  refundableOnly?: boolean
}
export interface PayableSettlementOption {
  id: string
  code: string
  name: string
  category?: string
  currencyCode?: string
  baseCurrencyCode?: string
  balanceCurrencyCode?: string
  accountSetId?: string | null
  accountSetName?: string
  supplierId?: string | null
  payeeSupplierId?: string | null
  payeeSupplierName?: string
  carrierId?: string | null
  customerId?: string | null
  payeeCustomerId?: string | null
  receivableLineId?: string | null
  sourceDocumentId?: string | null
  sourceDocumentNo?: string
  sourceLineNo?: number
  projectId?: string | null
  amount?: number | null
  balance?: number | null
  isDefault?: boolean
  defaultFundPurpose?: string
  enabled?: boolean
  businessType?: string
  payableWriteoff?: boolean
  kind?: string
}
export interface PayableSettlementTypeOption {
  id: string
  code: string
  name: string
  enabled: boolean
  tenant?: { tenantName?: string; tenantCode?: string }
}
export interface PayableSettlementBank {
  id: string
  supplierId?: string | null
  customerId?: string | null
  bankAccount: string
  accountName: string
  bankName: string
  currencyCode?: string | null
}
export interface PayableSettlementOptions {
  tenantId: string
  supplier: PayableSettlementOption[]
  purpose: PayableSettlementOption[]
  method: PayableSettlementOption[]
  fund: PayableSettlementOption[]
  project: PayableSettlementOption[]
  organization: PayableSettlementOption[]
  documentType: PayableSettlementOption[]
  currency: PayableSettlementOption[]
  payable: PayableSettlementOption[]
  customer?: PayableSettlementOption[]
  receivable?: PayableSettlementOption[]
  purchase: PayableSettlementOption[]
  expense: PayableSettlementOption[]
  bank?: PayableSettlementBank[]
  refundSource?: PayableSettlementLine[]
}
