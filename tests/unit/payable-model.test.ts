import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculatePayableLine,
  calculatePaymentPlans,
  validatePaymentPlans,
  payableCostDifference,
  roundPayable,
  payableLiabilityAmount,
  payableDocumentForEditing
} from '../../src/utils/finance/payable'
import type {
  PurchasePayableDocument,
  PurchasePayableLine
} from '../../src/api/purchase-payable.types'

const line: PurchasePayableLine = {
  id: 'line',
  sourceLineId: null,
  lineNo: 10,
  materialCode: 'MAT',
  materialDescription: '物料',
  projectName: null,
  constructionNo: null,
  unitName: '件',
  quantity: 2,
  unitPrice: 100,
  taxInclusiveUnitPrice: 113,
  taxRate: 13,
  amount: 200,
  taxAmount: 26,
  totalAmount: 226
}
const settings = { inputTaxInclusivePrice: true, inputAmount: false, discountIncludesTax: true }

test('红字编辑恢复绝对计价但不改写原投影、单价或核销余额', () => {
  const source: PurchasePayableDocument = {
    id: 'credit',
    tenantId: 'tenant',
    kind: 'financial',
    documentNo: 'AP-CREDIT',
    sourceDocumentId: null,
    sourceDocumentNo: '',
    supplierName: '回滚供应商',
    businessDate: '2026-10-24',
    status: 'draft',
    isCredit: true,
    amount: -200,
    taxAmount: -26,
    totalAmount: -226,
    lines: [
      {
        ...line,
        amount: -200,
        taxAmount: -26,
        totalAmount: -226,
        faceAmount: 200,
        faceTaxAmount: 26,
        faceTotalAmount: 226,
        unpaidAmount: -100
      }
    ]
  }
  const editing = payableDocumentForEditing(source)
  assert.deepEqual(
    [editing.lines[0].amount, editing.lines[0].taxAmount, editing.lines[0].totalAmount],
    [200, 26, 226]
  )
  assert.equal(editing.lines[0].quantity, 2)
  assert.equal(editing.lines[0].unitPrice, 100)
  assert.equal(editing.lines[0].unpaidAmount, -100)
  assert.equal(editing.totalAmount, -226)
  editing.lines[0].quantity = 3
  assert.equal(source.lines[0].quantity, 2)
  assert.equal(source.lines[0].totalAmount, -226)
  const fallback = payableDocumentForEditing({
    ...source,
    lines: [{ ...line, amount: -200, taxAmount: -26, totalAmount: -226 }]
  })
  assert.equal(fallback.lines[0].totalAmount, 226)
  const blue = { ...source, isCredit: false }
  assert.deepEqual(payableDocumentForEditing(blue), blue)
})

test('红字方向不会二次反转负投影、生成负零或改动暂估冲回', () => {
  assert.equal(payableLiabilityAmount(113, true), -113)
  assert.equal(payableLiabilityAmount(-113, true), -113)
  assert.equal(payableLiabilityAmount(-113, false), -113)
  assert.equal(payableLiabilityAmount(113, false), 113)
  assert.ok(Object.is(payableLiabilityAmount(0, true), 0))
})

test('单位联动复用物料换算，更新基本数量但不改数量、单价或分摊金额', () => {
  const withUnits: PurchasePayableLine = {
    ...line,
    quantity: 2,
    inventoryUnitId: 'box',
    baseUnitId: 'piece',
    baseQuantity: 2,
    materialUnits: {
      baseUnitId: 'piece',
      unitConversions: [{ sourceUnitId: 'box', sourceFactor: 1, baseFactor: 10 }]
    },
    totalAmount: 0.09,
    amount: 0.08,
    taxAmount: 0.01
  }
  const boxed = calculatePayableLine(withUnits, settings, 'inventoryUnitId')
  assert.equal(boxed.baseQuantity, 20)
  assert.equal(boxed.quantity, 2)
  assert.equal(boxed.unitPrice, 100)
  assert.equal(boxed.totalAmount, 0.09)
  const pieces = calculatePayableLine(
    { ...boxed, inventoryUnitId: 'piece' },
    settings,
    'inventoryUnitId'
  )
  assert.equal(pieces.baseQuantity, 2)
  const otherBase = calculatePayableLine({ ...boxed, baseUnitId: 'box' }, settings, 'baseUnitId')
  assert.equal(otherBase.baseQuantity, 2)
  const corrected = calculatePayableLine({ ...boxed, baseQuantity: 24 }, settings, 'baseQuantity')
  assert.equal(corrected.baseQuantityEdited, true)
  assert.equal(corrected.baseQuantity, 24)
  assert.equal(corrected.totalAmount, 0.09)
  const missing = calculatePayableLine(
    { ...boxed, inventoryUnitId: 'unconfigured' },
    settings,
    'inventoryUnitId'
  )
  assert.equal(missing.baseQuantity, undefined)
})
test('金额舍入与数据库一致，正负半分均远离零且不丢失外币折算尾分', () => {
  assert.equal(roundPayable(1.005), 1.01)
  assert.equal(roundPayable(-1.005), -1.01)
  assert.equal(roundPayable(0.03 * 1.5), 0.05)
})

test('固定换算不复用已圆整基本数量，手工校正则保留实际比例', () => {
  const configured = calculatePayableLine(
    {
      ...line,
      quantity: 1,
      inventoryUnitId: 'box',
      baseUnitId: 'piece',
      materialUnits: {
        baseUnitId: 'piece',
        unitConversions: [{ sourceUnitId: 'box', sourceFactor: 3, baseFactor: 1 }]
      }
    },
    settings,
    'inventoryUnitId'
  )
  assert.equal(configured.baseQuantity, 0.333333)
  const changed = calculatePayableLine({ ...configured, quantity: 3 }, settings, 'quantity', 1)
  assert.equal(changed.baseQuantity, 1)
  const manual = calculatePayableLine(
    { ...configured, baseQuantity: 0.4 },
    settings,
    'baseQuantity'
  )
  assert.equal(
    calculatePayableLine({ ...manual, quantity: 3 }, settings, 'quantity', 1).baseQuantity,
    1.2
  )
  assert.equal(
    calculatePayableLine(
      { ...manual, quantity: 1.5, baseQuantity: 1.000001 },
      settings,
      'quantity',
      3
    ).baseQuantity,
    0.500001
  )
})
test('部分到票数量调整沿用已带入的基本单位换算比例', () => {
  const changed = calculatePayableLine(
    { ...line, quantity: 1, baseQuantity: 20 },
    settings,
    'quantity',
    2
  )
  assert.equal(changed.baseQuantity, 10)
  assert.equal(changed.totalAmount, 113)
  assert.equal(calculatePayableLine({ ...changed, taxRate: 9 }, settings).baseQuantity, 10)
  assert.equal(
    calculatePayableLine({ ...line, quantity: 0, baseQuantity: 20 }, settings, 'quantity', 2)
      .baseQuantity,
    20
  )
})

test('应付含税价与不含税价双向换算', () => {
  const taxed = calculatePayableLine(
    { ...line, taxInclusiveUnitPrice: 113 },
    settings,
    'taxInclusiveUnitPrice'
  )
  assert.equal(taxed.unitPrice, 100)
  assert.equal(taxed.totalAmount, 226)
  const net = calculatePayableLine({ ...line, unitPrice: 200 }, settings, 'unitPrice')
  assert.equal(net.taxInclusiveUnitPrice, 226)
  assert.equal(net.totalAmount, 452)
})
test('含税折扣换算为净额后计算税额，保持价税恒等', () => {
  const result = calculatePayableLine(
    { ...line, discountMethod: 'rate', discountValue: 10 },
    settings
  )
  assert.equal(result.discountAmount, 22.6)
  assert.equal(result.amount, 180)
  assert.equal(result.taxAmount, 23.4)
  assert.equal(result.totalAmount, 203.4)
})
test('赠品清零与100%折扣均不保留应付余额', () => {
  const gift = calculatePayableLine({ ...line, gift: true }, settings)
  assert.deepEqual([gift.amount, gift.taxAmount, gift.totalAmount], [0, 0, 0])
  const discounted = calculatePayableLine(
    { ...line, discountMethod: 'rate', discountValue: 100 },
    settings
  )
  assert.equal(discounted.totalAmount, 0)
})
test('录入含税金额时保留价税合计，按税率拆分', () => {
  const result = calculatePayableLine(
    { ...line, totalAmount: 339 },
    { ...settings, inputAmount: true }
  )
  assert.equal(result.amount, 300)
  assert.equal(result.taxAmount, 39)
  assert.equal(result.totalAmount, 339)
})
test('含税录入口径锁定分位总额，调整数量不复用已圆整净单价', () => {
  const penny = calculatePayableLine(
    { ...line, quantity: 1, taxInclusiveUnitPrice: 0.04 },
    settings,
    'taxInclusiveUnitPrice'
  )
  assert.deepEqual([penny.amount, penny.taxAmount, penny.totalAmount], [0.04, 0, 0.04])
  const priced = calculatePayableLine(
    { ...line, quantity: 1000, taxInclusiveUnitPrice: 112.95 },
    settings,
    'taxInclusiveUnitPrice'
  )
  assert.equal(priced.priceBasis, 'gross')
  assert.equal(priced.totalAmount, 112950)
  const changed = calculatePayableLine({ ...priced, quantity: 1001 }, settings)
  assert.equal(changed.totalAmount, 113062.95)
  assert.equal(changed.taxInclusiveUnitPrice, 112.95)
  assert.equal(roundPayable(changed.amount + changed.taxAmount), changed.totalAmount)
  const restored = calculatePayableLine({ ...changed, quantity: 1000 }, settings)
  assert.deepEqual(restored, priced)
})

test('税率和模式切换保留最后实际价格口径，重新录入净价才切换', () => {
  const gross = calculatePayableLine(
    { ...line, quantity: 3, taxInclusiveUnitPrice: 0.05 },
    settings,
    'taxInclusiveUnitPrice'
  )
  const changed = calculatePayableLine(
    { ...gross, taxRate: 9 },
    { ...settings, inputTaxInclusivePrice: false }
  )
  assert.equal(changed.priceBasis, 'gross')
  assert.equal(changed.totalAmount, 0.15)
  const net = calculatePayableLine({ ...changed, unitPrice: 1 }, settings, 'unitPrice')
  assert.equal(net.priceBasis, 'net')
  assert.equal(net.totalAmount, 3.27)
  const amountEntry = calculatePayableLine(
    { ...gross, totalAmount: 0.04 },
    { ...settings, inputAmount: true }
  )
  assert.deepEqual(
    [amountEntry.amount, amountEntry.taxAmount, amountEntry.totalAmount],
    [0.04, 0, 0.04]
  )
  const gift = calculatePayableLine({ ...gross, gift: true }, settings)
  assert.deepEqual([gift.amount, gift.taxAmount, gift.totalAmount], [0, 0, 0])
  assert.equal(calculatePayableLine({ ...gift, gift: false }, settings).totalAmount, 0.15)
})

test('折扣先圆分，含税基准拆税吸收尾分且100%折扣归零', () => {
  const priced = calculatePayableLine(
    { ...line, quantity: 3, taxInclusiveUnitPrice: 0.05 },
    settings,
    'taxInclusiveUnitPrice'
  )
  const discounted = calculatePayableLine(
    { ...priced, discountMethod: 'rate', discountValue: 10 },
    settings
  )
  assert.equal(discounted.discountAmount, 0.02)
  assert.deepEqual(
    [discounted.amount, discounted.taxAmount, discounted.totalAmount],
    [0.12, 0.01, 0.13]
  )
  assert.equal(calculatePayableLine({ ...discounted, discountValue: 100 }, settings).totalAmount, 0)
})

test('付款计划开关在比例与金额间转换并拒绝不平衡计划', () => {
  const plans = [
    {
      dueDate: '2026-11-21',
      ratio: 30,
      amount: 0,
      sourceDocumentNo: '',
      contractNo: '',
      remark: ''
    },
    {
      dueDate: '2026-12-21',
      ratio: 70,
      amount: 0,
      sourceDocumentNo: '',
      contractNo: '',
      remark: ''
    }
  ]
  const calculated = calculatePaymentPlans(plans, 1130, true)
  assert.deepEqual(
    calculated.map((plan) => plan.amount),
    [339, 791]
  )
  assert.equal(validatePaymentPlans(calculated, 1130), null)
  assert.ok(validatePaymentPlans(calculated, 1000))
  assert.ok(validatePaymentPlans([{ ...calculated[0], dueDate: '' }], 339))
  assert.equal(calculatePaymentPlans(calculated, 1130, false)[0].ratio, 30)
})
test('成本差异覆盖两张单据税额是否计入成本的四种组合', () => {
  const estimate = { amount: 100, totalAmount: 113, taxExcludedFromCost: true }
  const finance = { amount: 110, totalAmount: 124.3, taxExcludedFromCost: true }
  assert.equal(payableCostDifference(estimate, finance), 10)
  assert.equal(payableCostDifference(estimate, { ...finance, taxExcludedFromCost: false }), 24.3)
  assert.equal(payableCostDifference({ ...estimate, taxExcludedFromCost: false }, finance), -3)
  assert.equal(
    payableCostDifference(
      { ...estimate, taxExcludedFromCost: false },
      { ...finance, taxExcludedFromCost: false }
    ),
    11.3
  )
})
test('双方税额计入成本时，净额相同仍确认税额变化产生的成本差', () => {
  const estimate = { amount: 100, totalAmount: 113, taxExcludedFromCost: false }
  const finance = { amount: 100, totalAmount: 109, taxExcludedFromCost: false }
  assert.equal(payableCostDifference(estimate, finance), -4)
  assert.equal(payableCostDifference(finance, estimate), 4)
})
test('付款比例尾差进入末期，非法日期和非有限金额不可保存', () => {
  const plan = {
    dueDate: '2026-11-21',
    ratio: 0,
    amount: 0,
    sourceDocumentNo: '',
    contractNo: '',
    remark: ''
  }
  const result = calculatePaymentPlans(
    [
      { ...plan, ratio: 33.3333 },
      { ...plan, ratio: 33.3333 },
      { ...plan, ratio: 33.3334 }
    ],
    0.01,
    true
  )
  assert.deepEqual(
    result.map((item) => item.amount),
    [0, 0, 0.01]
  )
  assert.equal(validatePaymentPlans(result, 0.01), null)
  assert.ok(validatePaymentPlans([{ ...plan, dueDate: '2026-02-30' }], 0))
  assert.ok(validatePaymentPlans([{ ...plan, amount: Number.POSITIVE_INFINITY }], 0))
})
