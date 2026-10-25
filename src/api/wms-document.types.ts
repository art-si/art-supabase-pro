export interface WmsDocumentClassification {
  documentType?: { documentTypeName: string } | null
  businessType?: {
    businessTypeName: string
    stockMovement: 'inbound' | 'outbound' | 'transfer' | null
  } | null
  isInitialization: boolean
  salesperson?: { employeeName: string } | null
  purchaser?: { employeeName: string } | null
  keeper?: { employeeName: string } | null
}
