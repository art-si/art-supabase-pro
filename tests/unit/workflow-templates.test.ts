import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createWorkflowTemplateDraft,
  workflowTemplates
} from '../../src/views/workflow/definition/modules/workflow-templates'
import {
  getWorkflowBusinessContract,
  getWorkflowBusinessSourcePath
} from '../../src/views/workflow/modules/workflow-business-contracts'

test('workflow templates only expose fields from registered business contracts', () => {
  for (const template of workflowTemplates) {
    const contract = getWorkflowBusinessContract(template.businessType)
    assert.equal(template.fieldCount, contract.fields.length)
    assert.ok(template.nodeNames.length >= 1)
  }
})

test('travel approval registers authoritative itinerary fields and locates its source application', () => {
  const contract = getWorkflowBusinessContract('fms_travel_application')
  assert.equal(contract.menuName, 'FinanceTravelApplication')
  assert.deepEqual(
    contract.fields.map((field) => field.key),
    ['amount', 'applicationNo', 'itemCount', 'estimatedDays', 'employeeId', 'organizationId']
  )
  const route = new URL(contract.routePath('application/1?'), 'https://example.test')
  assert.equal(route.pathname, '/fms/everyone-expense/travel-application')
  assert.equal(route.searchParams.get('applicationId'), 'application/1?')
})

test('approval snapshot source links use the current business route over a saved legacy route', () => {
  const vehicleId = 'vehicle-001'
  assert.equal(
    getWorkflowBusinessSourcePath(
      'vehicle_archive',
      vehicleId,
      `/vms/archive-manage/vehicle-archive-detail/${vehicleId}`
    ),
    `/vms/vehicle-archive-detail/${vehicleId}`
  )
  assert.equal(
    getWorkflowBusinessSourcePath(
      'tms_invoice',
      'invoice-001',
      '/tms-transportation/finance-center/invoice-management'
    ),
    '/fms/settlement/invoice-management'
  )
  assert.equal(
    getWorkflowBusinessSourcePath(
      'unregistered_type',
      'unknown-001',
      '/vehicle-manage-system/vehicle-query'
    ),
    '/vms/vehicle-query'
  )
})

test('workflow template drafts are isolated and fail closed by default', () => {
  const first = createWorkflowTemplateDraft('waybill-cost')
  const second = createWorkflowTemplateDraft('waybill-cost')

  assert.equal(first.businessType, 'tms_waybill_cost')
  assert.equal(first.config.allowAutoApprove, false)
  assert.equal(first.config.nodes.length, 2)
  assert.notEqual(first.config.nodes[0].key, second.config.nodes[0].key)

  first.config.nodes[0].name = '已修改'
  assert.equal(second.config.nodes[0].name, '费用审核')
})

test('sales contracts and orders register the exact menu and authoritative approval fields', () => {
  for (const [kind, menu, label] of [
    ['sales_contract', 'ScmSalesContract', '销售合同'],
    ['sales_order', 'ScmSalesOrder', '销售订单']
  ]) {
    const contract = getWorkflowBusinessContract(`scm_${kind}`)
    assert.equal(contract.menuName, menu)
    assert.equal(contract.label, label)
    assert.equal(contract.routePath('id'), `/scm/sales-management/${kind.replaceAll('_', '-')}`)
    assert.deepEqual(
      contract.fields.map((field) => field.key),
      ['documentNo', 'projectId', 'customerId', 'totalAmount']
    )
    assert.equal(
      createWorkflowTemplateDraft(`scm-${kind.replaceAll('_', '-')}`).businessType,
      contract.businessType
    )
  }
})
