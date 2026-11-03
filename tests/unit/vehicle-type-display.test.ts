import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatVehicleTypeDisplay,
  getVehicleTypeFallbackLabel
} from '../../src/utils/business/vehicle-type-display'

test('旧运输协议保留中文车型，编码只显示字典名称', () => {
  assert.equal(getVehicleTypeFallbackLabel('厢式货车'), '厢式货车')
  assert.equal(getVehicleTypeFallbackLabel('半挂车'), '半挂车')
  assert.equal(getVehicleTypeFallbackLabel('legacy_半挂车'), '未识别')
  assert.equal(formatVehicleTypeDisplay('厢式货车'), '厢式货车')
  assert.equal(formatVehicleTypeDisplay('11', { label: '重型厢式货车' }), '重型厢式货车')
  assert.equal(formatVehicleTypeDisplay('legacy_半挂车'), '待核对')
  assert.equal(formatVehicleTypeDisplay('box_truck'), '待核对')
})
