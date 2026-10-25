import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeQuotationPurchaseLines } from '../../modules/art-supabase-scm/src/api/quotation-purchase-lines'
import type { ScmPurchaseDocument } from '../../modules/art-supabase-scm/src/api/purchase-document.types'

const document: ScmPurchaseDocument = {
  id: 'order',
  tenantId: 'tenant',
  kind: 'purchase_order',
  documentNo: 'PO-TEST',
  documentTypeId: null,
  projectId: null,
  supplierId: null,
  sourceId: null,
  status: 'submitted',
  documentDate: '2026-10-09',
  deliveryDate: null,
  details: {},
  lines: [20, 30].map((lineNo, index) => ({
    lineId: `source-${index}`,
    lineNo,
    quotationLineId: `source-${index}`,
    sourceSalesDocumentId: 'quotation',
    materialId: `material-${index}`,
    materialCode: `ENG-${index}`,
    materialDescription: '测试物料',
    specification: '',
    unit: '件',
    quantity: (index + 1) * 10,
    unitPrice: 10,
    taxRate: 13,
    discountRate: 0,
    gift: false
  })),
  paymentPlans: [],
  deliveryPlans: [],
  clauses: [],
  subtotal: 300,
  taxAmount: 39,
  totalAmount: 339,
  remark: null,
  createdAt: '2026-10-09',
  updatedAt: '2026-10-09'
}
test('legacy quotation rows retain source numbers and stable identity while numbering purchase rows independently', () => {
  const normalized = normalizeQuotationPurchaseLines(document)
  assert.deepEqual(
    normalized.lines.map((line) => [line.lineNo, line.sourceLineNo, line.quantity]),
    [
      [10, 20, 10],
      [20, 30, 20]
    ]
  )
  assert.equal(normalized.status, 'submitted')
  assert.deepEqual(
    normalized.lines.map((line) => line.lineId),
    document.lines.map((line) => line.lineId)
  )
  assert.deepEqual(
    document.lines.map((line) => line.lineNo),
    [20, 30]
  )
  assert.equal(normalizeQuotationPurchaseLines(normalized), normalized)
})
test('manual purchase rows and non-order documents preserve their numbering', () => {
  const manual = {
    ...document,
    lines: document.lines.map((line) => ({
      ...line,
      quotationLineId: undefined,
      sourceSalesDocumentId: undefined
    }))
  }
  assert.equal(normalizeQuotationPurchaseLines(manual), manual)
  const request: ScmPurchaseDocument = { ...document, kind: 'purchase_request' }
  assert.equal(normalizeQuotationPurchaseLines(request), request)
})
