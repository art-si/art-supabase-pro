import type { PayableSourceKind } from '@/api/payable-source.types'
import type { ApplicationCode } from '@/config/application'
import {
  financePaths,
  SCM_PURCHASE_CONTRACT_PATH,
  SCM_PURCHASE_ORDER_PATH,
  WMS_PURCHASE_INBOUND_PATH
} from '@/router/business-paths'
import { isMaskedValue } from '@/utils/field-permission'

interface PayableSourceDefinition {
  kind: PayableSourceKind
  application: ApplicationCode
  path: string
  permission: string
  queryKey: 'recordId' | 'documentId'
}

export interface PayableSourceDestination extends PayableSourceDefinition {
  query: Record<string, string>
}

const definitions: PayableSourceDefinition[] = [
  {
    kind: 'estimated_payable',
    application: 'fms',
    path: financePaths.estimatedPayable,
    permission: 'FinanceEstimatedPayable:View',
    queryKey: 'recordId'
  },
  {
    kind: 'financial_payable',
    application: 'fms',
    path: financePaths.financialPayable,
    permission: 'FinancePurchasePayable:View',
    queryKey: 'recordId'
  },
  {
    kind: 'financial_receivable',
    application: 'fms',
    path: financePaths.financialReceivable,
    permission: 'FinanceFinancialReceivable:View',
    queryKey: 'recordId'
  },
  {
    kind: 'payable_application',
    application: 'fms',
    path: financePaths.payableApplication,
    permission: 'FinancePayableApplication:View',
    queryKey: 'recordId'
  },
  {
    kind: 'payable_payment',
    application: 'fms',
    path: financePaths.payablePayment,
    permission: 'FinancePayablePayment:View',
    queryKey: 'recordId'
  },
  {
    kind: 'purchase_contract',
    application: 'scm',
    path: SCM_PURCHASE_CONTRACT_PATH,
    permission: 'ScmPurchaseContract:View',
    queryKey: 'recordId'
  },
  {
    kind: 'purchase_order',
    application: 'scm',
    path: SCM_PURCHASE_ORDER_PATH,
    permission: 'ScmPurchaseOrder:View',
    queryKey: 'recordId'
  },
  {
    kind: 'purchase_inbound',
    application: 'wms',
    path: WMS_PURCHASE_INBOUND_PATH,
    permission: 'WmsPurchaseInbound:View',
    queryKey: 'documentId'
  },
  {
    kind: 'carrier_statement',
    application: 'fms',
    path: financePaths.carrierSettlement,
    permission: 'FinanceCarrierSettlement:View',
    queryKey: 'recordId'
  }
]

export function getPayableSourceDestination(
  kind: unknown,
  id: unknown
): PayableSourceDestination | undefined {
  if (typeof id !== 'string' || !id.trim() || isMaskedValue(id)) return undefined
  const definition = definitions.find((entry) => entry.kind === kind)
  return definition ? { ...definition, query: { [definition.queryKey]: id } } : undefined
}
