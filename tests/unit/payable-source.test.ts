import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getPayableSourceDestination } from '../../src/utils/finance/payable-source'
import { createArDeleteMetadata } from '../../modules/art-supabase-fms/src/views/accounts-receivable/modules/ar-delete-metadata'
import type { MasterDataDeleteDependencyDetail } from '../../src/api/master-data-delete'

test('source links use actual entity kinds, exact view permissions and receiver query keys', () => {
  for (const [kind, application, path, permission, queryKey] of [
    [
      'estimated_payable',
      'fms',
      '/fms/accounts-payable/estimated-payable',
      'FinanceEstimatedPayable:View',
      'recordId'
    ],
    [
      'financial_payable',
      'fms',
      '/fms/accounts-payable/purchase-payable',
      'FinancePurchasePayable:View',
      'recordId'
    ],
    [
      'financial_receivable',
      'fms',
      '/fms/accounts-receivable/financial-receivable',
      'FinanceFinancialReceivable:View',
      'recordId'
    ],
    [
      'payable_application',
      'fms',
      '/fms/accounts-payable/payment-application',
      'FinancePayableApplication:View',
      'recordId'
    ],
    [
      'payable_payment',
      'fms',
      '/fms/accounts-payable/payment',
      'FinancePayablePayment:View',
      'recordId'
    ],
    [
      'carrier_statement',
      'fms',
      '/fms/settlement/carrier-settlement',
      'FinanceCarrierSettlement:View',
      'recordId'
    ],
    [
      'purchase_inbound',
      'wms',
      '/wms/inbound-business/purchase-inbound',
      'WmsPurchaseInbound:View',
      'documentId'
    ],
    [
      'purchase_contract',
      'scm',
      '/scm/purchase-management/purchase-contract',
      'ScmPurchaseContract:View',
      'recordId'
    ],
    [
      'purchase_order',
      'scm',
      '/scm/purchase-management/purchase-order',
      'ScmPurchaseOrder:View',
      'recordId'
    ]
  ]) {
    const target = getPayableSourceDestination(kind, 'actual-source-id')
    assert.ok(target)
    assert.equal(target.application, application)
    assert.equal(target.path, path)
    assert.equal(target.permission, permission)
    assert.deepEqual(target.query, { [queryKey]: 'actual-source-id' })
  }
})

test('masked, empty, unsupported or prototype-like sources never invent navigation', () => {
  for (const value of [undefined, null, '', '  ', '***', 0, {}])
    assert.equal(getPayableSourceDestination('financial_payable', value), undefined)
  for (const kind of [undefined, '', 'constructor', '__proto__', 'purchase_request', 'CWYF'])
    assert.equal(getPayableSourceDestination(kind, 'actual-source-id'), undefined)
})

test('AR deletion references navigate to the actual unified payment document only with its View permission', () => {
  const metadata = createArDeleteMetadata(
    'financial',
    (permission) => permission === 'FinancePayableApplication:View'
  )
  const record: MasterDataDeleteDependencyDetail = {
    resourceId: 'original-ar',
    dependencyCode: 'payable_application',
    recordId: 'related-application',
    targetId: 'related-application',
    recordNo: 'FKSQ-202610-001',
    recordStatus: 'draft',
    createdAt: '2026-10-26T00:00:00Z',
    cleanupAllowed: false
  }
  for (const [code, path, allowed] of [
    ['payable_application', '/fms/accounts-payable/payment-application', true],
    ['payable_payment', '/fms/accounts-payable/payment', false],
    ['payable_refund', '/fms/accounts-payable/payment-refund', false]
  ] as const) {
    const reference = metadata[code]
    assert.equal(reference.routePath, path)
    assert.equal(reference.canNavigate?.(record), allowed)
    assert.equal(typeof reference.routeQuery, 'function')
    assert.ok(typeof reference.routeQuery === 'function')
    assert.deepEqual(reference.routeQuery(record), { recordId: record.targetId })
  }
})
