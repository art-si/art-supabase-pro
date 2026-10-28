import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculateWmsDocumentLineFinancial } from '../../src/utils/wms/document-line-financial'

const line = {
  gift: false,
  unitPrice: 10,
  taxInclusiveUnitPrice: 11.3,
  taxRate: 13,
  discountMethod: 'rate' as const,
  unitDiscountRate: 0.1,
  discountAmount: -1.23,
  amount: -17.77,
  taxAmount: -2.3,
  totalAmount: -20.07
}

test('赠品编辑行金额为零，但历史期初退货查看优先显示保存快照', () => {
  const gift = { ...line, gift: true }
  assert.deepEqual(calculateWmsDocumentLineFinancial(gift, 3, false), {
    discount: 0,
    amount: 0,
    tax: 0,
    total: 0
  })
  assert.deepEqual(calculateWmsDocumentLineFinancial(gift, 3, true), {
    discount: 1.23,
    amount: 17.77,
    tax: 2.3,
    total: 20.07
  })
})

test('含税价折扣、未税金额和税额保留原有分步舍入口径', () => {
  assert.deepEqual(calculateWmsDocumentLineFinancial(line, 3, false), {
    discount: 3.39,
    amount: 26.61,
    tax: 3.9,
    total: 30.51
  })
})

test('普通退货沿用调用方传入的负数量，期初退货快照取绝对值', () => {
  assert.deepEqual(
    calculateWmsDocumentLineFinancial({ ...line, discountMethod: 'none' }, -2, false),
    {
      discount: -0,
      amount: -20,
      tax: -2.6,
      total: -22.6
    }
  )
  assert.deepEqual(calculateWmsDocumentLineFinancial(line, -2, true), {
    discount: 1.23,
    amount: 17.77,
    tax: 2.3,
    total: 20.07
  })
})
