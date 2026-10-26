import assert from 'node:assert/strict'
import test from 'node:test'
import type { SmisPpeIssuanceRecord } from '../../modules/art-supabase-smis/src/api/types/issuance-and-documents'
import {
  createIssuanceEmployeeSnapshot,
  createIssuanceRecordEditState
} from '../../modules/art-supabase-smis/src/views/safety-production/issuance-record-model'

const record: SmisPpeIssuanceRecord = {
  id: 'issuance-1',
  tenantId: 'record-tenant',
  issuanceNo: 'ISS-001',
  employeeId: 'employee-1',
  employeeNo: 'E001',
  employeeName: '领用人',
  positionName: '操作员',
  organizationId: 'organization-1',
  organizationName: '一车间',
  warehouseId: 'warehouse-1',
  warehouseName: '安全用品仓',
  issuerEmployeeId: 'issuer-1',
  issuerName: '发放人',
  issueDate: '2026-09-20',
  status: 'draft',
  remark: null,
  items: [
    {
      id: 'item-1',
      materialId: 'material-1',
      materialCategory: '手部防护',
      materialName: '防护手套',
      specificationModel: 'M',
      unit: '双',
      issueQuantity: 2,
      remark: '原始备注'
    }
  ]
}

test('edit preserves record identity and builds selector snapshots without mutating the source', () => {
  const original = structuredClone(record)
  const state = createIssuanceRecordEditState(record, {
    copy: false,
    today: '2026-10-26',
    materialType: 'protective_equipment'
  })

  assert.equal(state.form.id, 'issuance-1')
  assert.equal(state.form.issuanceNo, 'ISS-001')
  assert.equal(state.form.issueDate, '2026-09-20')
  assert.equal(state.form.remark, '')
  assert.equal(state.form.items[0]?.id, undefined)
  assert.notStrictEqual(state.form.items[0], record.items[0])
  assert.deepEqual(state.selection.materialIds, ['material-1'])
  assert.deepEqual(state.selection.employee[0], {
    id: 'employee-1',
    tenantId: 'record-tenant',
    employeeNo: 'E001',
    employeeName: '领用人',
    jobTitle: '操作员',
    employmentStatus: 'active'
  })
  assert.equal(state.selection.warehouse[0]?.tenantId, 'record-tenant')
  assert.equal(state.selection.issuer[0]?.tenantId, 'record-tenant')
  assert.equal(state.selection.warehouse[0]?.organization.organizationName, '一车间')
  assert.equal(state.selection.materials[0]?.materialType, 'protective_equipment')
  assert.equal(state.selection.materials[0]?.tenantId, 'record-tenant')
  assert.equal(state.selection.materials[0]?.category.categoryName, '手部防护')
  assert.deepEqual(record, original)
})

test('copy clears document identity and date while retaining material and issuer snapshots', () => {
  const original = structuredClone(record)
  const state = createIssuanceRecordEditState(record, {
    copy: true,
    today: '2026-10-26',
    materialType: 'tool'
  })

  assert.equal(state.form.id, undefined)
  assert.equal(state.form.issuanceNo, '')
  assert.equal(state.form.issueDate, '2026-10-26')
  assert.equal(state.form.items[0]?.id, undefined)
  assert.equal(state.form.items[0]?.issueQuantity, 2)
  assert.equal(state.selection.issuer[0]?.employeeName, '发放人')
  assert.equal(state.selection.materials[0]?.materialType, 'tool')
  assert.equal(state.selection.materials[0]?.tenantId, 'record-tenant')
  assert.deepEqual(record, original)
})

test('new-record issuer uses the signed-in tenant while an existing record keeps its own tenant', () => {
  const currentIssuer = createIssuanceEmployeeSnapshot('viewer-tenant', 'issuer-1', '', '发放人')
  const existing = createIssuanceRecordEditState(record, {
    copy: false,
    today: '2026-10-26',
    materialType: 'tool'
  })

  assert.equal(currentIssuer.tenantId, 'viewer-tenant')
  assert.equal(existing.selection.issuer[0]?.tenantId, 'record-tenant')
  assert.equal(existing.selection.employee[0]?.tenantId, 'record-tenant')
  assert.equal(existing.selection.materials[0]?.tenantId, 'record-tenant')
  assert.equal(existing.selection.warehouse[0]?.tenantId, 'record-tenant')
})
