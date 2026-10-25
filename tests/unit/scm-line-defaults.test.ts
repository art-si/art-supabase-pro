import assert from 'node:assert/strict'
import test from 'node:test'
import { fillScmLineDefaults } from '../../modules/art-supabase-scm/src/views/sales-document/line-defaults'
import type {
  ScmDocumentLine,
  ScmMaterialOption
} from '../../modules/art-supabase-scm/src/api/sales-document.types'
const material: ScmMaterialOption = {
  id: 'material',
  tenantId: 'tenant',
  materialCode: 'M1',
  materialDescription: '物料',
  specification: '物料规格',
  manufacturer: '厂家',
  baseUnitName: '件',
  salesUnit: '箱',
  stockUnit: '件',
  auxiliaryUnit: '米',
  auxiliaryUnit2: '千克'
}
function line(): ScmDocumentLine {
  return {
    lineId: 'line',
    materialId: 'material',
    materialCode: 'M1',
    materialDescription: '物料',
    quantity: 2,
    unitPrice: 10,
    taxRate: 13
  }
}
test('来源缺失的物料资料和已选库存位置可补齐，要货日期优先使用明细日期', () => {
  const row: ScmDocumentLine = {
    ...line(),
    warehouseName: '仓库',
    binName: '库位',
    deliveryDate: '2026-10-16'
  }
  fillScmLineDefaults(row, material, '2026-10-15')
  assert.equal(row.specification, '物料规格')
  assert.equal(row.manufacturer, '厂家')
  assert.equal(row.salesUnit, '箱')
  assert.equal(row.auxiliaryUnit2, '千克')
  assert.equal(row.warehouse, '仓库')
  assert.equal(row.location, '库位')
  assert.equal(row.needDate, '2026-10-16')
})
test('来源明细和手工填写的值优先，成本零值保留，不臆造库存位置', () => {
  const row: ScmDocumentLine = {
    ...line(),
    specification: '来源规格',
    manufacturer: '来源厂家',
    salesUnit: '吨',
    needDate: '2026-10-17',
    costUnitPrice: 0,
    remark: '来源备注'
  }
  fillScmLineDefaults(row, material, '2026-10-15')
  assert.equal(row.specification, '来源规格')
  assert.equal(row.manufacturer, '来源厂家')
  assert.equal(row.salesUnit, '吨')
  assert.equal(row.costUnitPrice, 0)
  assert.equal(row.needDate, '2026-10-17')
  assert.equal(row.remark, '来源备注')
  assert.equal(row.warehouse, '')
  assert.equal(row.location, '')
})
test('无明细日期时继承单据交货日期，物料异步到达后补齐', () => {
  const row = line()
  fillScmLineDefaults(row, undefined, '2026-10-15')
  fillScmLineDefaults(row, material, '2026-10-18')
  assert.equal(row.needDate, '2026-10-15')
  assert.equal(row.baseUnit, '件')
})
