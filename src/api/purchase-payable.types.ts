import type { WmsMaterialUnits } from '@/utils/wms/material-quantity'

export type PurchasePayableKind = 'estimated' | 'financial'
export type PayableStatus = 'draft' | 'submitted' | 'approved'
export type PayableBasis = 'quantity' | 'amount'
export interface PayablePermissions {
  View: string
  Add: string
  Edit: string
  Submit: string
  Approve: string
  Delete: string
  Import: string
  Push: string
  Voucher: string
  Print: string
  Export: string
  Freeze?: string
  CostMatch?: string
  Accrual?: string
  AccrualDelete?: string
  AccrualExecute?: string
}
export interface PayablePaymentPlan {
  dueDate: string
  ratio: number
  amount: number
  sourceDocumentNo: string
  contractNo: string
  remark: string
}
export interface PayableEstimatedSource {
  id: string
  documentNo: string
  status: PayableStatus
}
export interface PurchasePayableLine {
  id: string
  sourceLineId: string | null
  estimatedLineId?: string | null
  estimatedDocumentId?: string | null
  estimatedDocumentNo?: string | null
  estimatedLineNo?: number | null
  lineNo: number
  materialId?: string | null
  materialCode: string
  materialDescription: string | null
  specificationModel?: string | null
  projectId?: string | null
  projectCode?: string | null
  projectName: string | null
  constructionNo: string | null
  inventoryUnitId?: string | null
  unitName: string | null
  baseUnitId?: string | null
  baseUnitName?: string | null
  baseQuantity?: number
  baseQuantityEdited?: boolean
  materialUnits?: WmsMaterialUnits
  quantity: number
  unitPrice: number
  priceBasis?: 'net' | 'gross'
  taxInclusiveUnitPrice?: number
  taxRate?: number
  discountMethod?: 'none' | 'rate' | 'unit'
  discountValue?: number
  discountAmount?: number
  gift?: boolean
  invoiceFirst?: boolean
  supplierId?: string | null
  supplierName?: string | null
  contractId?: string | null
  contractNo?: string | null
  departmentId?: string | null
  departmentName?: string | null
  sourceDocumentNo?: string
  sourceLineNo?: string
  remark?: string
  amount: number
  taxAmount: number
  totalAmount: number
  faceAmount?: number
  faceTaxAmount?: number
  faceTotalAmount?: number
  faceWrittenOffAmount?: number
  faceUnpaidAmount?: number
  linkedQuantity?: number
  linkedAmount?: number
  writtenOffAmount?: number
  unpaidAmount?: number
  matchedAmount?: number
  unmatchedAmount?: number
  frozenAmount?: number
  isReversed?: boolean
  reversedAmount?: number
  unreversedAmount?: number
  costDifference?: number
}
export interface PurchasePayableDocument {
  id: string
  tenantId: string
  accountSetId?: string | null
  accountSetName?: string | null
  currencyCode?: string
  baseCurrencyCode?: string
  exchangeRate?: number
  baseAmount?: number
  baseTaxAmount?: number
  baseTotalAmount?: number
  tenant?: { tenantName?: string; tenantCode?: string }
  kind: PurchasePayableKind
  documentNo: string
  documentTypeId?: string | null
  documentTypeName?: string
  standardPurchase?: boolean
  financialPayableTypeId?: string | null
  financialPayableTypeName?: string | null
  sourceType?: 'manual' | 'purchase_inbound' | 'carrier_statement'
  tmsStatementId?: string | null
  sourceDocumentId: string | null
  sourceDocumentNo: string
  automaticAccrual?: {
    runId: string
    policyId: string
    policyVersion: number
    policyCodeSnapshot: string
    policyNameSnapshot: string
  } | null
  estimatedSources?: PayableEstimatedSource[]
  supplierId?: string | null
  supplierName: string | null
  payeeSupplierId?: string | null
  payeeSupplierName?: string | null
  organizationId?: string | null
  organizationName?: string | null
  projectId?: string | null
  projectName?: string | null
  paymentTermId?: string | null
  paymentTermName?: string | null
  businessDate: string
  postingDate?: string
  status: PayableStatus
  basis?: PayableBasis
  taxExcludedFromCost?: boolean
  inputTaxInclusivePrice?: boolean
  inputAmount?: boolean
  discountIncludesTax?: boolean
  invoiceNo?: string
  remark?: string
  isReversal?: boolean
  isCredit?: boolean
  reversalOf?: string | null
  frozenAmount?: number
  freezeStatus?: 'none' | 'partial' | 'full'
  matchingStatus?: 'none' | 'partial' | 'full'
  writeoffStatus?: 'none' | 'partial' | 'full'
  linkedAmount?: number
  unlinkedAmount?: number
  reversedAmount?: number
  unreversedAmount?: number
  writtenOffAmount?: number
  unmatchedAmount?: number
  matchedAmount?: number
  unpaidAmount?: number
  voucherId?: string | null
  voucherNo?: string | null
  createdBy?: string
  version?: number
  amount: number
  taxAmount: number
  totalAmount: number
  faceAmount?: number
  faceTaxAmount?: number
  faceTotalAmount?: number
  faceBaseTotalAmount?: number
  faceWrittenOffAmount?: number
  faceUnpaidAmount?: number
  plansByRatio?: boolean
  paymentPlans?: PayablePaymentPlan[]
  lines: PurchasePayableLine[]
}
export interface PayableSearch {
  current: number
  size: number
  keyword?: string
  id?: string
  status?: string
  documentTypeId?: string
  organizationId?: string
  businessDateRange?: string[]
  freezeStatus?: string
  matchingStatus?: string
  writeoffStatus?: string
  viewMode?: 'document' | 'line'
}
export interface PayableOption extends WmsMaterialUnits {
  id: string
  name: string
  code?: string
  description?: string
  specificationModel?: string
  inventoryUnitId?: string
  unitName?: string
  days?: number
  standardPurchase?: boolean
}
export interface PayableCurrencyContext {
  accountSetId?: string | null
  accountSetName?: string | null
  currencyId?: string | null
  currencyCode: string
  baseCurrencyCode: string
  exchangeRate: number | null
  configured: boolean
  message: string
  currencies: PayableOption[]
}
export interface PaymentTerm extends PayableOption {
  tenantId: string
  enabled: boolean
  preset: boolean
  remark: string
}
export type PayableAction = 'submit' | 'approve' | 'freeze' | 'unfreeze' | 'delete'

export interface PayableStockCostBatch {
  id: string
  batchNo: string
  quantity: number
  unitCost: number
  afterUnitCost: number | null
  adjustmentAmount: number | null
  organizationId: string
  organizationName: string | null
  warehouseId: string
  warehouseName: string | null
  accountSetId: string | null
  accountSetName: string | null
  ownerType: string
}

export interface PayableStockCostLine {
  financialLineId: string
  lineNo: number
  sourceLineId: string
  sourceDocumentNo: string
  materialCode: string | null
  sourceBaseUnitName: string
  materialDescription: string | null
  tenantId: string
  accountSetId: string
  currencyCode: string
  logicalQuantity: number
  physicalQuantity: number
  basicQuantity: number
  originalAmount: number
  actualCostAmount: number
  apCostDifference: number
  baselineDifference: number
  adjustmentAmount: number
  stockQuantity: number
  transitQuantity: number
  stockValue: number
  valuationGap: number
  mixedSource: boolean
  allStock: boolean
  matched: boolean
  matchedDate: string | null
  batches: PayableStockCostBatch[]
}

export interface PayableStockCostPreview {
  id: string
  documentNo: string
  tenantId: string
  tenantName: string
  supplierName: string | null
  accountSetId: string
  accountSetName: string
  baseCurrencyCode: string
  costDate: string
  minimumDate: string
  version: number
  previewToken: string
  lines: PayableStockCostLine[]
}
