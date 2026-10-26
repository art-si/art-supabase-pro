import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildVoucherBusinessReferences,
  canReadVoucherReferences,
  isPayableWriteoffVoucherSource
} from '../../src/utils/finance/voucher-reference'
import type { VoucherReferenceSource } from '../../src/utils/finance/voucher-reference'
import type { PayableWriteoffRecord } from '../../src/api/payable-writeoff'

const source = (): VoucherReferenceSource => ({
  id: 'voucher',
  tenantId: 'tenant',
  accountSetId: 'book',
  sourceType: 'system',
  sourceId: 'writeoff',
  sourceNo: 'APHXD-001',
  sourceEventCode: 'ap_payable_refund_writeoff_approved',
  fieldAccess: { sourceReferences: 'read' }
})

const writeoff = (): PayableWriteoffRecord => ({
  id: 'writeoff',
  tenantId: 'tenant',
  accountSetId: 'book',
  supplierId: 'supplier',
  recordNo: 'APHX-001',
  relation: 'payable_refund',
  payableId: 'payable',
  payableNo: 'AP-001',
  receiptId: 'receipt',
  paymentNo: 'AR-RC-001',
  supplierName: '虚构供应商',
  writeoffDate: '2026-10-24',
  amount: 20,
  needsVoucher: true,
  status: 'active',
  remark: ''
})

for (const access of ['hidden', 'masked', undefined] as const) {
  test(`source access ${access} cannot expose references or trigger related reads`, () => {
    const current = source()
    current.fieldAccess = access ? { sourceReferences: access } : undefined
    assert.equal(canReadVoucherReferences(current), false)
    assert.equal(isPayableWriteoffVoucherSource(current), false)
    assert.deepEqual(buildVoucherBusinessReferences(current, writeoff()), [])
  })
}

test('writeoff discovery uses authoritative event and type, never number prefixes', () => {
  assert.equal(isPayableWriteoffVoucherSource(source()), true)
  assert.equal(isPayableWriteoffVoucherSource({ ...source(), sourceType: 'manual' }), false)
  assert.equal(isPayableWriteoffVoucherSource({ ...source(), sourceEventCode: 'unknown' }), false)
  assert.equal(isPayableWriteoffVoucherSource({ ...source(), sourceId: '***' }), false)
  assert.equal(isPayableWriteoffVoucherSource({ ...source(), sourceId: null }), false)
  assert.equal(isPayableWriteoffVoucherSource({ ...source(), sourceNo: 'arbitrary' }), true)
})

test('refund references link canonical record, payable and original supplier receipt', () => {
  const references = buildVoucherBusinessReferences(source(), writeoff())
  assert.equal(references.length, 3)
  assert.deepEqual(references[0], {
    key: 'writeoff',
    label: '核销记录',
    documentNo: 'APHX-001',
    routeName: 'FinancePayableWriteoff',
    permission: 'FinancePayableWriteoff:View',
    query: { recordId: 'writeoff', relation: 'payable_refund' }
  })
  assert.equal(references[1].permission, 'FinancePurchasePayable:View')
  assert.equal(references[2].routeName, 'FinanceReceipt')
  assert.deepEqual(references[2].query, { recordId: 'receipt' })
})

test('reversed records retain readable history navigation without a deleted document number', () => {
  const references = buildVoucherBusinessReferences(source(), {
    ...writeoff(),
    status: 'reversed',
    documentNo: null
  })
  assert.equal(references[0].documentNo, 'APHX-001')
})

test('a related record from another tenant or identity is rejected', () => {
  assert.throws(() =>
    buildVoucherBusinessReferences(source(), { ...writeoff(), tenantId: 'other' })
  )
  assert.throws(() => buildVoucherBusinessReferences(source(), { ...writeoff(), id: 'other' }))
  assert.throws(() =>
    buildVoucherBusinessReferences(source(), { ...writeoff(), accountSetId: 'other' })
  )
})

test('protected vouchers omit tenant metadata and bind related records through the original book', () => {
  const protectedSource = { ...source(), tenantId: undefined }
  assert.equal(buildVoucherBusinessReferences(protectedSource, writeoff()).length, 3)
  assert.throws(() =>
    buildVoucherBusinessReferences(protectedSource, { ...writeoff(), accountSetId: 'other' })
  )
  assert.throws(() =>
    buildVoucherBusinessReferences({ ...protectedSource, accountSetId: undefined }, writeoff())
  )
})

test('legacy writeoffs use matching original book snapshots, never the current default', () => {
  const historical = {
    ...writeoff(),
    accountSetId: undefined,
    matchSnapshot: {
      schemeCode: 'QA',
      schemeName: '历史方案',
      rules: [],
      primary: { accountSetId: 'book' },
      secondary: { accountSetId: 'book' }
    }
  }
  assert.equal(buildVoucherBusinessReferences(source(), historical).length, 3)
  assert.throws(() =>
    buildVoucherBusinessReferences(source(), {
      ...historical,
      accountSetId: 'another-original-book'
    })
  )
  for (const book of ['other', '***', null, undefined])
    assert.throws(() =>
      buildVoucherBusinessReferences(source(), {
        ...historical,
        matchSnapshot: { ...historical.matchSnapshot, secondary: { accountSetId: book } }
      })
    )
  assert.throws(() =>
    buildVoucherBusinessReferences({ ...source(), accountSetId: 'current-default' }, historical)
  )
})

test('red blue references navigate the credit payable rather than a receipt', () => {
  const references = buildVoucherBusinessReferences(source(), {
    ...writeoff(),
    relation: 'payable_red_blue',
    creditPayableId: 'credit'
  })
  assert.equal(references[2].label, '红字财务应付单')
  assert.equal(references[2].routeName, 'FinancePurchasePayable')
  assert.deepEqual(references[2].query, { recordId: 'credit' })
})

test('line identities are never passed as document identities', () => {
  for (const relation of ['payable_payment', 'payable_receivable', 'payment_refund'] as const) {
    const references = buildVoucherBusinessReferences(source(), {
      ...writeoff(),
      relation,
      payableId: relation === 'payment_refund' ? null : 'payable',
      paymentLineId: 'payment-line',
      refundLineId: 'refund-line',
      receivableLineId: 'ar-line'
    })
    assert.equal(references[2].routeName, undefined)
    if (relation === 'payment_refund') assert.equal(references[1].routeName, undefined)
  }
})

for (const [relation, routeName, identifier] of [
  ['payable_payment', 'FinancePayablePayment', 'paymentDocumentId'],
  ['payment_refund', 'FinancePayableRefund', 'refundDocumentId'],
  ['payable_receivable', 'FinanceFinancialReceivable', 'receivableDocumentId']
] as const) {
  test(`${relation} links only the server-resolved original header`, () => {
    const references = buildVoucherBusinessReferences(source(), {
      ...writeoff(),
      relation,
      paymentLineId: 'payment-line',
      refundLineId: 'refund-line',
      receivableLineId: 'receivable-line',
      paymentDocumentId: 'payment-header',
      [identifier]: 'original-header'
    })
    assert.equal(references[2].routeName, routeName)
    assert.equal(references[2].permission, `${routeName}:View`)
    assert.deepEqual(references[2].query, { recordId: 'original-header' })
    if (relation === 'payment_refund') {
      assert.equal(references[1].routeName, 'FinancePayablePayment')
      assert.deepEqual(references[1].query, { recordId: 'payment-header' })
    }
    assert.equal(
      buildVoucherBusinessReferences(source(), {
        ...writeoff(),
        relation,
        [identifier]: '***'
      })[2].routeName,
      undefined
    )
  })
}

for (const [sourceType, routeName] of [
  ['estimated_payable', 'FinanceEstimatedPayable'],
  ['financial_payable', 'FinancePurchasePayable'],
  ['reversal', 'FinanceVoucherCenter']
]) {
  test(`${sourceType} links to its exact original menu`, () => {
    const references = buildVoucherBusinessReferences({ ...source(), sourceType })
    assert.equal(references[0].routeName, routeName)
    assert.equal(references[0].permission, `${routeName}:View`)
  })
}

test('unknown sources remain readable metadata, not guessed routes', () => {
  const references = buildVoucherBusinessReferences({ ...source(), sourceType: 'payroll' })
  assert.equal(references[0].documentNo, 'APHXD-001')
  assert.equal(references[0].routeName, undefined)
})

test('manual and masked source numbers do not invent a business record', () => {
  assert.deepEqual(buildVoucherBusinessReferences({ ...source(), sourceNo: null }), [])
  assert.deepEqual(buildVoucherBusinessReferences({ ...source(), sourceNo: '***' }), [])
  assert.deepEqual(buildVoucherBusinessReferences(), [])
})
