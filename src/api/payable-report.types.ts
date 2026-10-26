export type PayableReportMode = 'detail' | 'summary' | 'aging'
export type PayableReportBalanceState =
  'ready' | 'amount_hidden' | 'source_mismatch' | 'history_incomplete'

export interface PayableReportQuery {
  mode?: PayableReportMode
  asOfDate?: string
  agingBasis?: 'due' | 'business'
  allocationMode?: 'oldest_due' | 'proportional'
  tenantId?: string
  accountSetId?: string
  organizationId?: string
  kind?: '' | 'estimated' | 'financial'
  partyType?: '' | 'supplier' | 'carrier'
  partyId?: string
  currencyCode?: string
  keyword?: string
  outstandingOnly?: boolean
  current?: number
  size?: number
  action?: 'view' | 'export' | 'print'
}

export interface PayableReportRow {
  id: string
  tenantId: string
  tenantName: string
  tenantCode: string
  accountSetId: string
  accountSetName: string
  organizationId: string | null
  organizationName: string | null
  kind: 'estimated' | 'financial'
  partyType: 'supplier' | 'carrier'
  partyId: string
  partyName: string
  partyCode: string
  currencyCode: string
  baseCurrencyCode: string
  balanceState: PayableReportBalanceState
  amountReadable: boolean
  documentCount: number
  documentId?: string
  documentNo?: string
  documentTypeName?: string
  sourceDocumentNo?: string
  businessDate?: string
  postingDate?: string
  dueDate?: string | null
  ageDays?: number | null
  exchangeRate?: number
  planStatus?: string
  occurrenceAmount: number | null
  reductionAmount: number | null
  balanceAmount: number | null
  baseBalanceAmount: number | null
  currentAmount: number | null
  age1To30: number | null
  age31To60: number | null
  age61To90: number | null
  age91To180: number | null
  ageOver180: number | null
  creditBalance: number | null
}

export interface PayableReportResponse {
  records: PayableReportRow[]
  total: number
  unavailableCount: number
  asOfDate: string
  mode: PayableReportMode
  agingBasis: 'due' | 'business'
  allocationMode: 'oldest_due' | 'proportional'
}

export interface PayableReportOption {
  id: string
  tenantId: string
  name: string
  code: string
}

export interface PayableReportOptions {
  books: PayableReportOption[]
  organizations: PayableReportOption[]
}
