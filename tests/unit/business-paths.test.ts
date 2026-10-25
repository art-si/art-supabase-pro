import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FMS_ROOT_PATH,
  TMS_ROOT_PATH,
  VMS_ROOT_PATH,
  financePaths,
  getExpenseReimbursementDetailPath,
  getWaybillCostDetailPath,
  resolveLegacyBusinessPath
} from '../../src/router/business-paths'

test('exposes finance routes from the standalone root', () => {
  assert.equal(FMS_ROOT_PATH, '/fms')
  assert.equal(financePaths.invoiceManagement, '/fms/settlement/invoice-management')
  assert.equal(financePaths.customerSettlement, '/fms/settlement/customer-settlement')
  assert.equal(financePaths.assetPayable, '/fms/settlement/asset-payable')
  assert.equal(financePaths.receivableAging, '/fms/settlement/receivable-aging')
  assert.equal(financePaths.cashForecast, '/fms/treasury/cash-forecast')
  assert.equal(financePaths.estimatedPayable, '/fms/accounts-payable/estimated-payable')
  assert.equal(financePaths.financialPayable, '/fms/accounts-payable/purchase-payable')
  assert.equal(
    getWaybillCostDetailPath('waybill-1'),
    '/fms/settlement/waybill-cost/detail/waybill-1'
  )
  assert.equal(
    getExpenseReimbursementDetailPath('claim-1'),
    '/fms/everyone-expense/expense-reimbursement/detail/claim-1'
  )
  assert.equal(financePaths.voucherCenter, '/fms/accounting/voucher-center')
  assert.equal(financePaths.autoPosting, '/fms/accounting/auto-posting')
})

test('redirects legacy finance bookmarks without changing their suffix', () => {
  assert.equal(
    resolveLegacyBusinessPath('/fms/settlement/purchase-payable'),
    '/fms/accounts-payable/purchase-payable'
  )
  assert.equal(resolveLegacyBusinessPath('/tms-transportation/finance-center'), '/fms')
  assert.equal(
    resolveLegacyBusinessPath(
      '/tms-transportation/finance-center/expense-reimbursement/detail/claim-1'
    ),
    '/fms/everyone-expense/expense-reimbursement/detail/claim-1'
  )
  assert.equal(
    resolveLegacyBusinessPath('/fms/settlement/expense-reimbursement/detail/claim-1'),
    '/fms/everyone-expense/expense-reimbursement/detail/claim-1'
  )
  assert.equal(
    resolveLegacyBusinessPath('/fms/settlement/estimated-payable'),
    '/fms/accounts-payable/estimated-payable'
  )
})

test('redirects legacy business roots to their renamed modules', () => {
  assert.equal(resolveLegacyBusinessPath('/finance/workbench'), '/fms/workbench')
  assert.equal(resolveLegacyBusinessPath('/tms-transportation/order-list'), '/tms/order-list')
  assert.equal(
    resolveLegacyBusinessPath('/vehicle-manage-system/vehicle-query'),
    '/vms/vehicle-query'
  )
  assert.equal(TMS_ROOT_PATH, '/tms')
  assert.equal(VMS_ROOT_PATH, '/vms')
})

test('redirects WMS bookmarks into their business categories', () => {
  assert.equal(resolveLegacyBusinessPath('/wms/adjustment'), '/wms/adjustment-business/adjustment')
  assert.equal(
    resolveLegacyBusinessPath('/wms/stock-operation'),
    '/wms/receipt-issue/stock-operation'
  )
  assert.equal(
    resolveLegacyBusinessPath('/wms/project-report'),
    '/wms/project-warehouse/project-report'
  )
  assert.equal(
    resolveLegacyBusinessPath('/wms/transfer-adjustment/adjustment'),
    '/wms/adjustment-business/adjustment'
  )
  assert.equal(
    resolveLegacyBusinessPath('/wms/transfer-adjustment/count'),
    '/wms/count-business/count'
  )
  assert.equal(
    resolveLegacyBusinessPath('/wms/transfer-adjustment/transfer'),
    '/wms/transfer-business/step-transfer'
  )
  assert.equal(
    resolveLegacyBusinessPath('/wms/receipt-issue/issue-request'),
    '/wms/outbound-business/outbound-request'
  )
})

test('ignores paths outside the legacy business namespaces', () => {
  assert.equal(resolveLegacyBusinessPath('/tms/order-list'), undefined)
  assert.equal(resolveLegacyBusinessPath('/dashboard'), undefined)
})
