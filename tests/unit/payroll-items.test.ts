import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPayrollItems,
  readPayrollItems
} from '../../modules/art-supabase-fms/src/views/specialized-accounting/payroll/modules/payroll-items'

test('editing preserves named payroll items including unknown historical categories', () => {
  const source = { 基本工资: 6000, 提成: 1800, 历史补助: 200 }
  const rows = readPayrollItems(source, 8000, '未分类收入')
  assert.deepEqual(buildPayrollItems(rows), { items: source, total: 8000 })
  rows[1].amount = 2000
  assert.deepEqual(buildPayrollItems(rows), {
    items: { 基本工资: 6000, 提成: 2000, 历史补助: 200 },
    total: 8200
  })
  assert.equal(source.提成, 1800)
})
test('legacy totals remain unclassified and decimal sums are exact', () => {
  assert.deepEqual(readPayrollItems({}, 200, '未分类扣款'), [{ name: '未分类扣款', amount: 200 }])
  assert.equal(
    buildPayrollItems([
      { name: '项目一', amount: 0.1 },
      { name: '项目二', amount: 0.2 }
    ]).total,
    0.3
  )
})
test('masked, inconsistent and duplicate items cannot silently overwrite source', () => {
  assert.throws(() => readPayrollItems('***', 0, '未分类收入'))
  assert.throws(() => readPayrollItems({ 基本工资: 6000 }, 8000, '未分类收入'))
  assert.throws(() =>
    buildPayrollItems([
      { name: '提成', amount: 1 },
      { name: ' 提成 ', amount: 2 }
    ])
  )
  for (const amount of [null, -1, NaN, Infinity])
    assert.throws(() => buildPayrollItems([{ name: '提成', amount }]))
})
