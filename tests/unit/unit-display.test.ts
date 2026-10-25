import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createUnitDisplayIndex,
  resolveUnitDisplayName
} from '../../src/utils/business/unit-display'

test('单位编码和 ID 按单据租户解析，已保存名称保持可读', () => {
  const index = createUnitDisplayIndex([
    { id: 'a', tenantId: 'tenant-a', unitCode: 'U02', unitName: '台' },
    { id: 'b', tenantId: 'tenant-b', unitCode: 'U02', unitName: '件' }
  ])
  assert.equal(resolveUnitDisplayName(index, 'tenant-a', 'U02'), '台')
  assert.equal(resolveUnitDisplayName(index, 'tenant-b', 'U02'), '件')
  assert.equal(resolveUnitDisplayName(index, 'tenant-a', 'a'), '台')
  assert.equal(resolveUnitDisplayName(index, 'tenant-a', 'b'), 'b')
  assert.equal(resolveUnitDisplayName(index, 'tenant-a', 'KG'), '千克')
  assert.equal(resolveUnitDisplayName(index, 'tenant-a', ''), '—')
})

test('主数据英文名称和历史英文单位统一显示中文，租户自定义名称优先', () => {
  const index = createUnitDisplayIndex([
    { id: 'kg', tenantId: 'tenant-a', unitCode: 'U66', unitName: 'KG' },
    { id: 'pc', tenantId: 'tenant-a', unitCode: 'U99', unitName: 'PC' },
    { id: 'custom', tenantId: 'tenant-b', unitCode: 'PC', unitName: '只' }
  ])
  assert.equal(resolveUnitDisplayName(index, 'tenant-a', 'U66'), '千克')
  assert.equal(resolveUnitDisplayName(index, 'tenant-a', 'U99'), '件')
  assert.equal(resolveUnitDisplayName(index, 'tenant-a', 'item'), '件')
  assert.equal(resolveUnitDisplayName(index, 'tenant-a', 'pcs'), '件')
  assert.equal(resolveUnitDisplayName(index, 'tenant-b', 'PC'), '只')
})
