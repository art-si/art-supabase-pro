import assert from 'node:assert/strict'
import test from 'node:test'
import type { EquipmentReference } from '../../modules/art-supabase-mdm/src/api'
import { prepareProductionEquipmentImport } from '../../modules/art-supabase-mdm/src/views/engineering/production-equipment/production-equipment-import'

const reference = (
  id: string,
  tenantId: string,
  code: string,
  name: string
): EquipmentReference => ({ id, tenantId, code, name })

const categories = [
  reference('category-a', 'tenant-a', 'CAT', '通用分类'),
  reference('category-b', 'tenant-b', 'CAT', '通用分类')
]
const departments = [
  reference('department-a', 'tenant-a', 'LINE', '一号产线'),
  reference('department-b', 'tenant-b', 'LINE', '一号产线')
]
const row = {
  设备编号: ' EQ-001 ',
  设备名称: ' 切割机 ',
  设备分类: 'CAT',
  '部门/产线': 'LINE',
  设备品牌: ' 品牌 ',
  设备型号: ' M1 '
}

test('production equipment import resolves category and department inside the selected tenant', () => {
  const [prepared] = prepareProductionEquipmentImport([row], categories, departments, 'tenant-b')
  assert.deepEqual(prepared, {
    fileRow: 2,
    payload: {
      tenantId: 'tenant-b',
      categoryId: 'category-b',
      productionDepartmentId: 'department-b',
      equipmentCode: 'EQ-001',
      equipmentName: '切割机',
      equipmentBrand: '品牌',
      model: 'M1',
      factoryNo: '',
      fixedAssetNo: '',
      syncWorkCenter: false,
      operationStatus: 'normal',
      status: 'enabled',
      sort: 10
    }
  })
})

test('platform-all import rejects an ambiguous department instead of mixing tenants', () => {
  assert.throws(
    () => prepareProductionEquipmentImport([row], categories, departments),
    /第 2 行部门\/产线存在多个匹配记录：LINE，请先选择目标租户后重新导入/
  )
})

test('production equipment import resolves category from the department tenant', () => {
  const [prepared] = prepareProductionEquipmentImport([row], categories, [departments[1]])
  assert.equal(prepared?.payload.tenantId, 'tenant-b')
  assert.equal(prepared?.payload.categoryId, 'category-b')
})

test('production equipment import validates the complete file and duplicate tenant codes', () => {
  assert.throws(
    () =>
      prepareProductionEquipmentImport(
        [row, { ...row, 设备名称: '' }],
        categories,
        departments,
        'tenant-a'
      ),
    /第 3 行缺少设备名称/
  )
  assert.throws(
    () =>
      prepareProductionEquipmentImport(
        [row, { ...row, 设备名称: '另一设备' }],
        categories,
        departments,
        'tenant-a'
      ),
    /第 3 行设备编号在同一目标租户内重复：EQ-001/
  )
})

test('production equipment import enforces its bounded batch size', () => {
  assert.throws(() => prepareProductionEquipmentImport([], categories, departments), /1 至 1000/)
  assert.throws(
    () =>
      prepareProductionEquipmentImport(
        Array.from({ length: 1001 }, () => row),
        categories,
        departments,
        'tenant-a'
      ),
    /1 至 1000/
  )
})
