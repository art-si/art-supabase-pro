import assert from 'node:assert/strict'
import test from 'node:test'
import {
  lineTotal,
  lineSubtotal,
  lineTaxAmount,
  lineDiscountAmount,
  lineTaxedUnitPrice
} from '../../modules/art-supabase-scm/src/views/purchase-document/purchase-line-amounts'
import type { ScmPurchaseLine } from '../../modules/art-supabase-scm/src/api/purchase-document.types'
import {
  calculateTaxExclusiveUnitPrice,
  calculateTaxInclusiveUnitPrice
} from '../../src/utils/finance/unit-price'

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

test('含税与未税单价以数据库的四位小数规则舍入', () => {
  assert.equal(calculateTaxInclusiveUnitPrice(0.005, 13), 0.0057)
  assert.equal(calculateTaxInclusiveUnitPrice(-0.005, 13), -0.0057)
  assert.equal(calculateTaxInclusiveUnitPrice(0.004, 6.25), 0.0043)
  assert.equal(calculateTaxInclusiveUnitPrice(0.0003, 0), 0.0003)
  assert.equal(calculateTaxExclusiveUnitPrice(0.0003, 20), 0.0003)
  assert.equal(calculateTaxExclusiveUnitPrice(-0.0003, 20), -0.0003)
  assert.ok(Number.isNaN(calculateTaxExclusiveUnitPrice(1, -100)))
  assert.ok(Number.isNaN(calculateTaxInclusiveUnitPrice(Infinity, 13)))
})

test('采购打印沿用已保存的含税单价，旧单缺失单价时才从未税价推算', () => {
  const historicalLine = { ...line, unitPrice: 0.005, taxInclusiveUnitPrice: 0.0056 }
  assert.equal(lineTaxedUnitPrice(historicalLine, 'purchase_order'), 0.0056)
  assert.equal(
    lineTaxedUnitPrice({ ...historicalLine, taxInclusiveUnitPrice: undefined }, 'purchase_order'),
    0.0057
  )
})
