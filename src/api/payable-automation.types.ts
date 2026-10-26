import type { PayableReference, PayableWriteoffRelation } from './payable-reference'
import type { PayableCrossCurrencyMode } from './payable-writeoff'

export interface PayableAutomationBook {
  id: string
  tenantId: string
  name: string
  code: string
  active: boolean
}

export interface PayableAutomationConfiguration {
  id: string
  tenantId: string
  name: string
  schemeId: string
  accountSetId: string
  enabled: boolean
  relations: PayableWriteoffRelation[]
  allowCrossParty: boolean
  crossCurrencyMode: PayableCrossCurrencyMode
  version: number
  schemeVersion: number
  schemeName: string
  accountSetName: string
  actorName: string
  pauseReason: string
  jobCount: number
}

export type PayableAutomationJobStatus =
  'pending' | 'succeeded' | 'no_match' | 'blocked' | 'cancelled' | 'failed'

export interface PayableAutomationJob {
  id: string
  tenantId: string
  automationId: string
  automationName: string
  automationVersion: number
  configurationVersion: number
  configurationEnabled: boolean
  schemeVersion: number
  jobNo: string
  relation: PayableWriteoffRelation
  status: PayableAutomationJobStatus
  sourceKind: 'payable' | 'payment' | 'refund' | 'receivable' | 'receipt_line'
  sourceId: string
  sourceDocumentId: string
  sourceDocumentNo: string
  businessDate: string
  availableAt: string
  actorName: string
  attemptCount: number
  recordCount: number
  errorCode?: string
  message: string
  createdAt: string
  finishedAt?: string
}

export interface PayableAutomationWorkspace {
  configurationVersion: 1
  configurations: { data: PayableAutomationConfiguration[]; total: number }
  jobs: { data: PayableAutomationJob[]; total: number }
  books: PayableAutomationBook[]
  schemes: Array<PayableReference & { id: string; tenantId: string; version: number }>
  relations: Array<{ label: string; value: PayableWriteoffRelation }>
  runtime: { available: boolean; lastRunAt?: string; lastSucceededAt?: string }
}

export interface PayableAutomationInput {
  id?: string
  version?: number
  schemeId: string
  expectedSchemeVersion: number | undefined
  accountSetId: string
  name: string
  enabled: boolean
  relations: PayableWriteoffRelation[]
  allowCrossParty: boolean
  crossCurrencyMode: PayableCrossCurrencyMode
  processExisting: boolean
}

export interface PayableAutomationQuery {
  tenantId?: string | null
  automationId?: string
  jobId?: string
  keyword?: string
  status?: PayableAutomationJobStatus
  configurationPage?: number
  jobPage?: number
  size?: number
}

export interface PayableAutomationRecordLink {
  id: string
  recordNo: string
  documentNo?: string | null
  status: string
  writeoffDate: string
  needsVoucher: boolean
  voucherNo?: string | null
}

export type PayableAutomationRecord = PayableAutomationRecordLink
