import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildLoadingLines } from '../../modules/art-supabase-scm/src/views/sales-document/loading-selection'
import type { ScmLoadingChoice } from '../../modules/art-supabase-scm/src/api/sales-document'

const choice = (changes: Partial<ScmLoadingChoice> = {}): ScmLoadingChoice => ({
  key: 'notice:line:batch',
  noticeId: 'notice',
  noticeNo: 'N1',
  noticeLineId: 'line',
  noticeLineNo: 10,
  line: {
    lineId: 'line',
    materialId: 'material',
    materialCode: 'M1',
    materialDescription: '物料',
    quantity: 10,
    unitPrice: 2,
    taxRate: 13,
    baseUnit: '件',
    salesUnit: '箱',
    auxiliaryUnit: '千克',
    auxiliaryUnit2: '米'
  },
  noticeQuantity: 10,
  availableQuantity: 8,
  loadedQuantity: 2,
  availableStock: 5,
  stockBatchId: 'batch',
  warehouseId: 'warehouse',
  warehouseName: '仓库',
  zoneName: '库区',
  binName: '库位',
  batchNo: 'B1',
  ...changes
})

test('同一通知明细分批装车时只带入余量并继承单位和库存位置', () => {
  const rows = buildLoadingLines(
    [choice(), choice({ stockBatchId: 'batch-2', availableStock: 20 })],
    [],
    () => 'new-line'
  )
  assert.deepEqual(
    rows.map((row) => row.quantity),
    [5, 3]
  )
  assert.equal(rows[0].salesUnit, '箱')
  assert.equal(rows[0].auxiliaryUnit2, '米')
  assert.equal(rows[0].sourceDocumentId, 'notice')
  assert.equal(rows[0].binName, '库位')
  assert.equal(rows[0].warehouse, '仓库')
  assert.equal(rows[0].location, '库位')
  assert.deepEqual(
    rows.map((row) => row.lineNo),
    [10, 20]
  )
})

test('不同通知明细共享一个库存批次时不重复分配库存', () => {
  const rows = buildLoadingLines(
    [choice(), choice({ noticeId: 'notice-2', noticeLineId: 'line-2' })],
    [],
    () => 'new-line'
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].quantity, 5)
})

test('继续选单时扣除当前装车明细占用的通知余量和库存', () => {
  const existing = buildLoadingLines([choice({ availableStock: 3 })], [], () => 'existing')
  const rows = buildLoadingLines([choice()], existing, () => 'new')
  assert.equal(rows[0].quantity, 2)
  assert.equal(rows[0].lineNo, 20)
})

test('分批小数数量保持三位精度，不产生数据库拒绝的浮点尾数', () => {
  const existing = buildLoadingLines(
    [choice({ availableQuantity: 0.3, availableStock: 0.1 })],
    [],
    () => 'existing'
  )
  const rows = buildLoadingLines(
    [choice({ availableQuantity: 0.3, availableStock: 0.3 })],
    existing,
    () => 'new'
  )
  assert.equal(rows[0].quantity, 0.2)
})
