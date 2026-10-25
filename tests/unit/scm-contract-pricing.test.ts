import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  calculateContractLine,
  contractAuxiliaryQuantity,
  quotationTaxExclusivePrice,
  quotationTaxInclusivePrice
} from '../../modules/art-supabase-scm/src/views/sales-document/quotation-pricing'
import type {
  ScmDocumentLine,
  ScmMaterialOption
} from '../../modules/art-supabase-scm/src/api/sales-document.types'

const line = (changes: Partial<ScmDocumentLine> = {}): ScmDocumentLine => ({
  lineId: 'line-1',
  materialId: 'material-1',
  materialCode: 'M-1',
  materialDescription: '测试物料',
  quantity: 2,
  unitPrice: 100,
  taxRate: 13,
  costUnitPrice: 0,
  gift: false,
  discountMode: 'none',
  discountRate: 0,
  ...changes
})

test('合同未税和含税单价互推到四位小数', () => {
  assert.equal(quotationTaxInclusivePrice(line()), 113)
  assert.equal(quotationTaxExclusivePrice(113, 13), 100)
  assert.equal(quotationTaxExclusivePrice(10, 13), 8.8496)
})

test('合同折扣按含税价计算，税额按未税价计算，赠品归零', () => {
  assert.deepEqual(calculateContractLine(line({ discountMode: 'percentage', discountRate: 10 })), {
    discount: 22.6,
    amount: 177.4,
    tax: 26,
    total: 203.4
  })
  assert.deepEqual(calculateContractLine(line({ gift: true })), {
    discount: 0,
    amount: 0,
    tax: 0,
    total: 0
  })
})

test('辅助数量按物料单位换算关系计算', () => {
  const material = {
    unitConversions: [{ sourceUnitId: 'box', sourceFactor: 1, baseFactor: 10 }]
  } as ScmMaterialOption
  assert.equal(contractAuxiliaryQuantity(25, 'box', material), 2.5)
  assert.equal(contractAuxiliaryQuantity(25, 'missing', material), undefined)
})

test('空数量不产生合同金额或辅助数量', () => {
  assert.deepEqual(calculateContractLine(line({ quantity: null })), {
    discount: 0,
    amount: 0,
    tax: 0,
    total: 0
  })
  assert.equal(
    contractAuxiliaryQuantity(null, 'box', {
      unitConversions: [{ sourceUnitId: 'box', sourceFactor: 1, baseFactor: 10 }]
    } as ScmMaterialOption),
    undefined
  )
})
