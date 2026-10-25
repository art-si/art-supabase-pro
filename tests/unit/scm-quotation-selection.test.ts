import assert from 'node:assert/strict'
import test from 'node:test'
import type { ScmSalesDocument } from '../../modules/art-supabase-scm/src/api/sales-document.types'
import {
  quotationActionLines,
  selectedQuotationDocuments
} from '../../modules/art-supabase-scm/src/views/sales-document/quotation-selection'

function quotation(id: string): ScmSalesDocument {
  return {
    id,
    tenantId: 'tenant',
    kind: 'sales_quotation',
    documentNo: `QUOTE-${id}`,
    documentTypeId: null,
    projectId: null,
    customerId: null,
    sourceId: null,
    status: 'draft',
    documentDate: '2026-10-08',
    deliveryDate: null,
    currency: 'CNY',
    details: {},
    lines: ['shared-line', 'other-line'].map((lineId) => ({
      lineId,
      materialId: '',
      materialCode: '',
      materialDescription: lineId,
      quantity: 1,
      unitPrice: 1,
      taxRate: 0
    })),
    fees: [],
    paymentPlans: [],
    deliveryPlans: [],
    clauses: [],
    subtotal: 2,
    feeTotal: 0,
    taxAmount: 0,
    costTotal: 0,
    totalAmount: 2,
    grossProfit: 0,
    grossMargin: 0,
    remark: null,
    createdAt: '',
    updatedAt: ''
  }
}

test('quotation detail selections keep identical line IDs isolated by document', () => {
  const documents = [quotation('a'), quotation('b')]
  const before = structuredClone(documents)
  const lines = quotationActionLines(documents)
  const selected = selectedQuotationDocuments(documents, [lines[0], lines[3]])
  assert.deepEqual(
    selected.map((document) => ({
      id: document.id,
      lines: document.lines.map((line) => line.lineId)
    })),
    [
      { id: 'a', lines: ['shared-line'] },
      { id: 'b', lines: ['other-line'] }
    ]
  )
  assert.deepEqual(documents, before)
  assert.deepEqual(selectedQuotationDocuments(documents, []), [])
})
