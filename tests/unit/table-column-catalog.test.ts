import assert from 'node:assert/strict'
import test from 'node:test'
import { generateColumnCatalog } from '../../scripts/generate-table-column-catalog'

test('catalog includes keyed recruitment lists, wrapped report ledgers and insurance children, excluding drawer-only lists', () => {
  const paths = [
    '/hr/recruitment/workbench',
    '/mes/production-execution/report-detail',
    '/vms/vehicle-manage/vehicle-insurance',
    '/mes/production-execution/production-report',
    '/system/column-config'
  ]
  const result = generateColumnCatalog(
    paths.map((component, index) => ({
      id: String(index),
      component,
      type: 'menu',
      path: component,
      parent_id: null
    }))
  )
  const recruitment = result.catalogs.find((item) => item.routePath === paths[0])!
  assert.ok(recruitment)
  assert.deepEqual(
    [...new Set(recruitment.columns.flatMap((column) => column.groups ?? []))].sort(),
    ['candidate', 'handoff', 'interview', 'offer', 'requisition', 'task']
  )
  const ledger = result.catalogs.find((item) => item.routePath === paths[1])!
  assert.ok(ledger.columns.some((column) => column.key === 'reportedAt'))
  assert.equal(ledger.columns.find((column) => column.key === 'operation')?.locked, true)
  const insurance = result.catalogs.find((item) => item.routePath === paths[2])!
  assert.ok(insurance.columns.some((column) => column.parentKey?.startsWith('__group__')))
  assert.ok(result.unregistered.some((item) => item.routePath === paths[3]))
  assert.ok(!result.catalogs.some((item) => item.routePath === paths[4]))
})
