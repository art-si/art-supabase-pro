import assert from 'node:assert/strict'
import test from 'node:test'
import {
  lineTotal,
  lineSubtotal,
  lineTaxAmount,
  lineDiscountAmount
} from '../../modules/art-supabase-scm/src/views/purchase-document/purchase-line-amounts'
import type { ScmPurchaseLine } from '../../modules/art-supabase-scm/src/api/purchase-document.types'

const line: ScmPurchaseLine = {
  lineId: 'line',
  materialId: 'material',
  materialCode: 'MAT',
  materialDescription: '物料',
  specification: '',
  unit: '件',
  quantity: 10,
  unitPrice: 100,
  taxInclusiveUnitPrice: 113,
  taxRate: 13,
  discountRate: 10,
  gift: false
}
test('订单打印与订单表单沿用含税折扣、税额和合计口径', () => {
  assert.equal(lineDiscountAmount(line, 'purchase_order'), 113)
  assert.equal(lineTaxAmount(line, 'purchase_order'), 130)
  assert.equal(lineSubtotal(line, 'purchase_order'), 887)
  assert.equal(lineTotal(line, 'purchase_order'), 1017)
  assert.equal(lineTotal({ ...line, gift: true }, 'purchase_order'), 0)
})
test('收料表单仍按原有税前折扣核算', () => {
  assert.equal(lineSubtotal(line, 'receipt_notice'), 900)
  assert.equal(lineTaxAmount(line, 'receipt_notice'), 117)
  assert.equal(lineTotal(line, 'receipt_notice'), 1017)
})
