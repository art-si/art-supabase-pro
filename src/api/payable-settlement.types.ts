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
  supplierName?: string
  payeeSupplierName?: string
  supplierCode?: string
  purposeName?: string
  payableId?: string | null
  purchaseId?: string | null
  contractId?: string | null
  contractNo?: string
  applicationLineId?: string | null
  refundPaymentLineId?: string | null
  refundPaymentDocumentNo?: string
  accountSetId?: string | null
  expiredDiscountAmount?: number
  availableRefundAmount?: number
  availableRefundDiscount?: number
  sourcePurposeBusinessType?: string
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
  counterpartyBalance?: number
  paidAmount?: number
  writtenOffAmount?: number
  unassignedAmount?: number
  bankAccount: string
  bankAccountName: string
  bankName: string
  bankReference: string
  fundPurpose: string
  sourceDocumentNo?: string
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
  documentTypeId?: string
  documentTypeName?: string
  status: string
  businessDate: string
  postingDate?: string
  currencyCode: string
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
  accountSetId?: string | null
  accountSetName?: string
  supplierId?: string | null
  carrierId?: string | null
  projectId?: string | null
  amount?: number
  balance?: number
  isDefault?: boolean
  defaultFundPurpose?: string
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
  supplierId: string
  bankAccount: string
  accountName: string
  bankName: string
  currencyCode: string
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
  purchase: PayableSettlementOption[]
  expense: PayableSettlementOption[]
  bank?: PayableSettlementBank[]
  refundSource?: PayableSettlementLine[]
}
