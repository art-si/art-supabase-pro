import assert from 'node:assert/strict'
import test from 'node:test'
import { createWmsMaterialFromSelectRow } from '../../src/utils/wms/material-select'

test('WMS material selection preserves valid identity and conversion data', () => {
  assert.deepEqual(
    createWmsMaterialFromSelectRow(
      {
        id: 'material-1',
        code: 'MAT-001',
        name: '测试物料',
        drawingNo: 'DRAW-001',
        brand: '测试品牌',
        materialSource: 'purchased',
        description: '说明',
        specificationModel: 'M-01',
        inventoryUnitId: 'unit-box',
        baseUnitId: 'unit-piece',
        auxiliaryUnitId: 0,
        unitConversions: [
          { sourceUnitId: 'unit-box', sourceFactor: 1, baseFactor: 12 },
          { sourceUnitId: '', sourceFactor: 1, baseFactor: 1 },
          { sourceUnitId: 'bad', sourceFactor: 0, baseFactor: 1 }
        ],
        serialManagementEnabled: true,
        batchManagementEnabled: true
      },
      'tenant-1'
    ),
    {
      id: 'material-1',
      tenantId: 'tenant-1',
      code: 'MAT-001',
      name: '测试物料',
      drawingNo: 'DRAW-001',
      brand: '测试品牌',
      materialSource: 'purchased',
      description: '说明',
      specificationModel: 'M-01',
      inventoryUnitId: 'unit-box',
      baseUnitId: 'unit-piece',
      auxiliaryUnitId: null,
      auxiliaryUnit2Id: null,
      unitConversions: [{ sourceUnitId: 'unit-box', sourceFactor: 1, baseFactor: 12 }],
      serialManagementEnabled: true,
      batchManagementEnabled: true
    }
  )
})

test('WMS material selection rejects incomplete identities', () => {
  for (const row of [
    { id: '', code: 'MAT-001', name: '物料' },
    { id: 'material-1', code: ' ', name: '物料' },
    { id: 'material-1', code: 'MAT-001', name: null }
  ]) {
    assert.equal(createWmsMaterialFromSelectRow(row, 'tenant-1'), null)
  }
})

test('WMS material selection keeps batch rules and rejects another tenant selection', () => {
  const row = {
    id: 'material-1',
    tenantId: 'tenant-1',
    code: 'MAT-001',
    name: '批次物料',
    batchManagementEnabled: true,
    serialManagementEnabled: false
  }
  assert.equal(createWmsMaterialFromSelectRow(row, 'tenant-1')?.batchManagementEnabled, true)
  assert.equal(createWmsMaterialFromSelectRow(row, 'tenant-2'), null)
  assert.equal(createWmsMaterialFromSelectRow(row, ''), null)
  assert.equal(
    createWmsMaterialFromSelectRow({ ...row, batchManagementEnabled: false }, 'tenant-1')
      ?.batchManagementEnabled,
    false
  )
})
