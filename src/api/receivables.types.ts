export type ArWorkspaceKind =
  | 'estimate'
  | 'financial'
  | 'receipt'
  | 'refund'
  | 'revenue'
  | 'writeoff'
  | 'adjustment'
  | 'condition'
  | 'payment_request'

export interface ArQuery {
  current?: number
  size?: number
  id?: string
  ids?: string[]
  tenantId?: string | null
  keyword?: string
  status?: string
  organizationId?: string
  customerId?: string
  projectId?: string
  documentTypeId?: string
  documentKind?: 'estimate' | 'financial' | 'reversal'
  currencyCode?: string
  onlyUnlinked?: boolean
  businessDateRange?: string[]
  viewMode?: string
  voucherGenerated?: string
  accountingStatus?: string
  financialId?: string
  sourceDocumentId?: string
  isCredit?: boolean
}

export interface ArOption {
  id: string
  tenantId: string
  code: string
  name: string
  description?: string
  specificationModel?: string
  inventoryUnitId?: string
  baseUnitId?: string
  dueDays?: number
  isDefault?: boolean
  currencyCode?: string
  customerId?: string
  amount?: number | null
  fundAccountId?: string
  businessDate?: string
  sameCustomer?: boolean
  sameCurrency?: boolean
  sameProject?: boolean
  sameSource?: boolean
}

export interface ArReportRow {
  id: string
  documentNo?: string
  customerName: string
  organizationName?: string
  projectName?: string
  businessDate?: string
  dueDate?: string
  kind: string
  currencyCode: string
  occurrenceAmount: number | null
  balanceAmount: number | null
  ageDays?: number
  age0To30?: number | null
  age31To60?: number | null
  age61To90?: number | null
  ageOver90?: number | null
}

export interface ReceiptLine {
  id?: string
  lineNo: number
  financialLineId: string | null
  amount: number | null
  projectId?: string
  sourceNo?: string
  remark?: string
}

export interface ReceiptDocument {
  id: string
  supplierId?: string | null
  supplierName?: string | null
  partyName?: string | null
  requestId?: string
  tenantId: string
  documentNo: string
  receiptNo?: string
  status: string
  customerId: string
  customerName?: string
  settlementOrganizationId: string
  organizationName?: string
  businessDate: string
  currencyCode: string
  exchangeRate?: number
  amount: number | null
  availableAmount?: number | null
  refundableAmount?: number | null
  paymentMethod: string
  bankReference?: string
  matchingReference?: string
  fundAccountId?: string
  cashTransactionId?: string
  sourceNo?: string
  remark?: string
  lines: ReceiptLine[]
  paymentRequestId?: string
  paymentRequestStatus?: string
  originalReceiptId?: string
  voucherId?: string
}

export interface ArPaymentRequest {
  id: string
  tenantId: string
  documentNo: string
  status: string
  refundId?: string | null
  creditFinancialId?: string | null
  customerId: string
  customerName: string
  settlementOrganizationId: string
  organizationName: string
  businessDate: string
  currencyCode: string
  amount: number | null
  paymentMethod: string
  fundAccountId: string
  fundAccountName?: string
  sourceNo: string
  paymentPurpose: 'refund' | 'credit'
  remark?: string
  ledgerEntryId?: string
  voucherId?: string
  exchangeRate: number
}

export interface RevenueCostLine {
  id: string
  lineNo: number
  estimateLineId: string
  description: string
  revenueAmount: number | null
  costAmount: number | null
  costSourceType?: string
}

export interface RevenueCostDocument {
  id: string
  tenantId: string
  documentNo: string
  status: string
  businessDate: string
  estimateId: string
  sourceNo: string
  customerName: string
  organizationName?: string
  revenueAmount: number | null
  costAmount: number | null
  voucherId?: string
  remark?: string
  lines: RevenueCostLine[]
}

export type ArSourceType = 'financial' | 'receipt' | 'refund' | 'bad_debt'
export interface WriteoffCandidate {
  id: string
  documentId: string
  documentNo: string
  tenantId: string
  sourceType: ArSourceType
  status: string
  organizationId: string
  customerId: string
  customerName: string
  currencyCode: string
  exchangeRate: number
  businessDate: string
  dueDate?: string
  projectId?: string
  sourceNo?: string
  isCredit?: boolean
  amount: number
  outstandingAmount?: number
  availableAmount: number
  lineNo?: number
  description?: string
  writeoffAmount: number
  remark: string
}

export interface WriteoffSide {
  id: string
  sourceType: ArSourceType
  side: 'primary' | 'secondary'
  amount: number
  remark?: string
}
export interface WriteoffPayload {
  requestId?: string
  relationKind: string
  writeoffDate: string
  organizationId: string
  schemeId?: string
  crossCustomer: boolean
  crossCurrency: boolean
  reason: string
  sides: WriteoffSide[]
}
export interface WriteoffCheckResult {
  documentNo: string
  availableAmount: number
  currencyCode: string
  message: string
}
export interface WriteoffRecordSide {
  id: string
  side: string
  sourceType: ArSourceType
  sourceId: string
  documentNo: string
  currencyCode: string
  originalAmount: number | null
  baseAmount: number | null
  exchangeRate: number
  remark?: string
}
export interface WriteoffRecord {
  id: string
  tenantId: string
  documentNo: string
  businessDate: string
  status: string
  relationKind: string
  organizationName: string
  exchangeGainLoss: number | null
  reason?: string
  reversalOfId?: string
  autoReceiptId?: string
  autoRefundId?: string
  autoPaymentRequestId?: string
  sides: WriteoffRecordSide[]
}
export interface ArAdjustment {
  currencyCode?: string
  id: string
  tenantId: string
  documentNo: string
  status: string
  sourceNo: string
  customerName: string
  businessDate: string
  kind: string
  amount: number | null
  reason: string
}
export interface ReceiptCondition {
  id: string
  tenantId: string
  documentNo: string
  conditionCode: string
  name: string
  conditionName: string
  dueDays: number
  isEnabled: boolean
  remark: string
}
export interface ArVoucherResult {
  message: string
  voucherId?: string
  lines?: Array<{
    summary: string
    subjectCode: string
    subjectName: string
    debitAmount: number
    creditAmount: number
  }>
}
