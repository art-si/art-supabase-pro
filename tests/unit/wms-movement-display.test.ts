import assert from 'node:assert/strict'
import test from 'node:test'
import { formatWmsMovementType } from '../../src/utils/wms/movement-display'

test('库存流水使用字典标签并保留历史未知事件码', () => {
  const options = [{ value: 'purchase_in', label: '采购收货入库' }]

  assert.equal(formatWmsMovementType('purchase_in', options), '采购收货入库')
  assert.equal(formatWmsMovementType('legacy_adjustment', options), 'legacy_adjustment')
  assert.equal(formatWmsMovementType(null, options), '—')
})
