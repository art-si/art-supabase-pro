import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatVehicleTypeDisplay,
  getVehicleTypeFallbackLabel,
  formatVehicleTypeMetric,
  vehicleTypeProfileLabel
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

test('车型规格区分车长与载重，未配置值与零值保持清晰', () => {
  assert.equal(
    vehicleTypeProfileLabel({ category: '半挂车', lengthM: 13, loadTons: 28 }),
    '半挂车 · 13 米'
  )
  assert.equal(
    vehicleTypeProfileLabel({ category: '按载重', lengthM: 13, loadTons: 28 }),
    '按载重 · 28 吨'
  )
  assert.equal(
    vehicleTypeProfileLabel({ category: '半挂车', lengthM: null, loadTons: 28 }),
    '半挂车'
  )
  assert.equal(
    vehicleTypeProfileLabel({ category: '按载重', lengthM: 13, loadTons: null }),
    '按载重'
  )
  assert.equal(
    vehicleTypeProfileLabel({ category: '按载重', lengthM: null, loadTons: 0 }),
    '按载重 · 0 吨'
  )
  assert.equal(formatVehicleTypeMetric(null, '米'), '未配置')
  assert.equal(formatVehicleTypeMetric(undefined, '立方米'), '未配置')
  assert.equal(formatVehicleTypeMetric(0, '立方米'), '0 立方米')
  assert.equal(formatVehicleTypeMetric(17.5, '米'), '17.5 米')
})
