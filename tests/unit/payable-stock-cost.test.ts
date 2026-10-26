import assert from 'node:assert/strict'
import test from 'node:test'
import type { PayableStockCostPreview } from '../../src/api/purchase-payable.types'
import {
  isPayableStockCostPreview,
  payableStockCostBlocker,
  payableStockCostUnitFormat
} from '../../src/utils/finance/payable-stock-cost'
import { formatNumberValue } from '../../src/utils/ui/format'

function fixture(): PayableStockCostPreview {
  return {
    id: 'finance-1',
    documentNo: 'CWYF-COST-1',
    tenantId: 'tenant-1',
    tenantName: '独立成本验收租户',
    supplierName: '虚构成本供应商',
    accountSetId: 'book-1',
    accountSetName: '验收账套',
    baseCurrencyCode: 'CNY',
    costDate: '2026-10-25',
    minimumDate: '2026-10-24',
    version: 1,
    previewToken: 'authoritative-preview-token',
    lines: [
      {
        financialLineId: 'line-1',
        lineNo: 10,
        sourceLineId: 'source-line-1',
        sourceDocumentNo: 'CGRK-COST-1',
        sourceBaseUnitName: '验收件',
        materialCode: 'MAT-1',
        materialDescription: '虚构验收物料',
        tenantId: 'tenant-1',
        accountSetId: 'book-1',
        currencyCode: 'CNY',
        logicalQuantity: 1,
        physicalQuantity: 1,
        basicQuantity: 1,
        originalAmount: 100,
        actualCostAmount: 110,
        apCostDifference: 10,
        baselineDifference: 0,
        adjustmentAmount: 10,
        stockQuantity: 1,
        transitQuantity: 0,
        stockValue: 100,
        valuationGap: 0,
        mixedSource: false,
        allStock: true,
        matched: false,
        matchedDate: null,
        batches: [
          {
            id: 'batch-1',
            batchNo: 'BATCH-1',
            quantity: 1,
            unitCost: 100,
            afterUnitCost: 110,
            adjustmentAmount: 10,
            organizationId: 'org-1',
            organizationName: '验收库存组织',
            warehouseId: 'warehouse-1',
            warehouseName: '验收仓库',
            accountSetId: 'book-1',
            accountSetName: '验收账套',
            ownerType: 'self'
          }
        ]
      }
    ]
  }
}

test('cost preview validates a complete server plan without recalculating its monetary allocation', () => {
  const plan = fixture()
  assert.equal(isPayableStockCostPreview(plan), true)
  assert.equal(payableStockCostBlocker(plan), '')
  plan.lines[0].physicalQuantity = 10000
  plan.lines[0].batches[0].quantity = 10000
  plan.lines[0].batches[0].unitCost = 1
  plan.lines[0].batches[0].afterUnitCost = 1.000001
  plan.lines[0].batches[0].adjustmentAmount = 0.01
  assert.equal(isPayableStockCostPreview(plan), true)
})

test('cost preview rejects missing tokens, malformed amounts and cross-tenant or cross-book rows', () => {
  for (const alter of [
    (plan: PayableStockCostPreview) => {
      plan.previewToken = ''
    },
    (plan: PayableStockCostPreview) => {
      plan.lines[0].tenantId = 'other'
    },
    (plan: PayableStockCostPreview) => {
      plan.lines[0].accountSetId = 'other'
    },
    (plan: PayableStockCostPreview) => {
      plan.lines[0].currencyCode = 'USD'
    },
    (plan: PayableStockCostPreview) => {
      plan.lines[0].actualCostAmount = Number.NaN
    },
    (plan: PayableStockCostPreview) => {
      plan.lines[0].basicQuantity = 0
    },
    (plan: PayableStockCostPreview) => {
      plan.lines[0].batches[0].unitCost = Number.POSITIVE_INFINITY
    }
  ]) {
    const plan = fixture()
    alter(plan)
    assert.equal(isPayableStockCostPreview(plan), false)
  }
  const plan = fixture()
  assert.equal(
    isPayableStockCostPreview({ ...plan, lines: [{ ...plan.lines[0], originalAmount: '100' }] }),
    false
  )
})

test('non-batch-managed stock accepts an empty batch number without accepting missing batch identities', () => {
  const plan = fixture()
  plan.lines[0].batches[0].batchNo = ''
  assert.equal(isPayableStockCostPreview(plan), true)
  assert.equal(payableStockCostBlocker(plan), '')
  const batch = plan.lines[0].batches[0]
  assert.equal(
    isPayableStockCostPreview({
      ...plan,
      lines: [{ ...plan.lines[0], batches: [{ ...batch, batchNo: null }] }]
    }),
    false
  )
  batch.id = ''
  assert.equal(isPayableStockCostPreview(plan), false)
})

test('issued, in-transit and mixed stock cannot be confirmed as an ordinary batch reprice', () => {
  for (const patch of [{ allStock: false }, { mixedSource: true }, { transitQuantity: 1 }]) {
    const plan = fixture()
    Object.assign(plan.lines[0], patch)
    assert.match(payableStockCostBlocker(plan), /已发出、在途或混合/)
  }
})

test('valuation mismatches and invalid batch prices block confirmation', () => {
  const plan = fixture()
  plan.lines[0].valuationGap = 0.01
  assert.match(payableStockCostBlocker(plan), /金额与已登记成本流水不一致/)
  plan.lines[0].valuationGap = 0
  plan.lines[0].batches[0].accountSetId = 'foreign-book'
  assert.match(payableStockCostBlocker(plan), /账套映射/)
  plan.lines[0].batches[0].accountSetId = plan.accountSetId
  plan.lines[0].batches[0].afterUnitCost = -1
  assert.match(payableStockCostBlocker(plan), /无法形成有效金额分配/)
})

test('completed history is display-only and future posting dates remain unavailable', () => {
  const plan = fixture()
  plan.minimumDate = '2026-10-26'
  assert.match(payableStockCostBlocker(plan), /晚于今天/)
  plan.lines[0].matched = true
  plan.lines[0].matchedDate = '2026-10-24'
  plan.lines[0].stockQuantity = 0
  assert.match(payableStockCostBlocker(plan), /执行时的金额与批次快照/)
})

test('stock unit cost display retains tiny costs without binary floating-point tails', () => {
  assert.equal(formatNumberValue(124.3, 'zh-CN', payableStockCostUnitFormat), '124.3')
  assert.equal(formatNumberValue(1.000001, 'zh-CN', payableStockCostUnitFormat), '1.000001')
  assert.equal(
    formatNumberValue(0.00000000000000001, 'zh-CN', payableStockCostUnitFormat),
    '0.00000000000000001'
  )
})

test('an empty cost plan is not reported as completed zero-value history', () => {
  const plan = fixture()
  plan.lines = []
  assert.equal(isPayableStockCostPreview(plan), true)
  assert.match(payableStockCostBlocker(plan), /没有可核对/)
})
