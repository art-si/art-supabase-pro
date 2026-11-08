import assert from 'node:assert/strict'
import test from 'node:test'
import {
  inferAiBankBatchMapping,
  normalizeAiBankBatchRows,
  type AiBankCounterparty
} from '../../supabase/functions/_shared/ai-bank-statement-batch-contract'
import { normalizeAiCashVoucherResponse } from '../../supabase/functions/_shared/ai-cash-voucher-ocr-contract'

function analyze(
  counterparties: AiBankCounterparty[],
  name = '示例物流',
  transactionDate: unknown = '2026-11-01'
) {
  const source = {
    交易日期: transactionDate,
    收支方向: '收入',
    交易金额: '100.00',
    对方户名: name,
    银行流水号: 'SYNTHETIC-REF-001'
  }
  return normalizeAiBankBatchRows([source], {
    mapping: inferAiBankBatchMapping(Object.keys(source)),
    counterparties,
    statementCandidates: [],
    existingReferences: new Set<string>()
  })[0]
}

test('bank matching keeps unique exact counterparty matches ready', () => {
  const row = analyze([{ id: 'customer-a', name: '示例物流', direction: 'receipt' }])
  assert.equal(row.counterpartyId, 'customer-a')
  assert.equal(row.counterpartyScore, 100)
  assert.equal(row.status, 'ready')
  assert.deepEqual(row.issues, [])
})

test('bank matching rejects equal exact matches regardless of source order', () => {
  const parties: AiBankCounterparty[] = [
    { id: 'customer-a', name: '示例物流', direction: 'receipt' },
    { id: 'customer-b', name: '示例物流', direction: 'receipt' }
  ]
  for (const order of [parties, [...parties].reverse()]) {
    const row = analyze(order)
    assert.equal(row.counterpartyId, null)
    assert.equal(row.status, 'review')
    assert.ok(row.issues.some((issue) => issue.includes('不唯一')))
    assert.deepEqual(row.allocations, [])
  }
})

test('bank matching treats normalized name collisions as ambiguous', () => {
  const row = analyze([
    { id: 'customer-a', name: '示例物流', direction: 'receipt' },
    { id: 'customer-b', name: '示例 物流', direction: 'receipt' }
  ])
  assert.equal(row.counterpartyId, null)
  assert.equal(row.status, 'review')
})

test('bank matching rejects equally strong partial matches', () => {
  const row = analyze([
    { id: 'customer-a', name: '示例物流一部', direction: 'receipt' },
    { id: 'customer-b', name: '示例物流二部', direction: 'receipt' }
  ])
  assert.equal(row.counterpartyId, null)
  assert.equal(row.counterpartyScore, 0)
  assert.equal(row.status, 'review')
})

test('bank matching prefers an exact match over a partial match', () => {
  const row = analyze([
    { id: 'customer-partial', name: '示例物流一部', direction: 'receipt' },
    { id: 'customer-exact', name: '示例物流', direction: 'receipt' }
  ])
  assert.equal(row.counterpartyId, 'customer-exact')
  assert.equal(row.counterpartyScore, 100)
  assert.equal(row.status, 'ready')
})

test('bank matching separates receipt customers from payment carriers', () => {
  const row = analyze([
    { id: 'carrier-a', name: '示例物流', direction: 'payment' },
    { id: 'customer-a', name: '示例物流', direction: 'receipt' }
  ])
  assert.equal(row.counterpartyId, 'customer-a')
  assert.equal(row.status, 'ready')
})

test('bank matching never matches a blank master-data name', () => {
  const row = analyze([{ id: 'customer-blank', name: '   ', direction: 'receipt' }])
  assert.equal(row.counterpartyId, null)
  assert.equal(row.status, 'review')
  assert.ok(row.issues.includes('未匹配到系统往来单位'))
})

test('bank matching excludes blank names before choosing a valid partial match', () => {
  const row = analyze([
    { id: 'customer-blank', name: '', direction: 'receipt' },
    { id: 'customer-valid', name: '示例物流有限公司', direction: 'receipt' }
  ])
  assert.equal(row.counterpartyId, 'customer-valid')
  assert.equal(row.counterpartyScore, 82)
  assert.equal(row.status, 'ready')
})

test('bank matching keeps its lookup local to each batch and leaves master data unchanged', () => {
  const first: AiBankCounterparty[] = [{ id: 'customer-a', name: '示例物流', direction: 'receipt' }]
  const second: AiBankCounterparty[] = [
    { id: 'customer-b', name: '示例物流', direction: 'receipt' }
  ]
  const before = structuredClone([first, second])
  assert.equal(analyze(first).counterpartyId, 'customer-a')
  assert.equal(analyze(second).counterpartyId, 'customer-b')
  assert.deepEqual([first, second], before)
})

test('cash vouchers retain canonical OCR text cleanup through the local shared import', () => {
  const result = normalizeAiCashVoucherResponse({
    rawText: '第一行\u0000\r\n第二行',
    voucher: { payerName: '示例物流', transactionDate: '2026-11-01', amount: 100 }
  })
  assert.equal(result.rawText, '第一行\n第二行')
  assert.equal(result.voucher.payerName, '示例物流')
  assert.equal(result.voucher.transactionDate, '2026-11-01')
  assert.equal(result.voucher.amount, 100)
  assert.deepEqual(result.missingFields, [])
})

test('bank Excel date serials retain their calendar day at noon and in the evening', () => {
  for (const fraction of [0, 0.25, 0.5, 0.75, 0.99999]) {
    const row = analyze(
      [{ id: 'customer-a', name: '示例物流', direction: 'receipt' }],
      '示例物流',
      40729 + fraction
    )
    assert.equal(row.transactionDate, '2011-07-05', `serial fraction ${fraction}`)
    assert.equal(row.status, 'ready')
  }
})

test('bank Excel date serials advance only at the next calendar day', () => {
  for (const [serial, expected] of [
    [40729.99999, '2011-07-05'],
    [40730, '2011-07-06'],
    [40730.25, '2011-07-06']
  ] as const) {
    const row = analyze(
      [{ id: 'customer-a', name: '示例物流', direction: 'receipt' }],
      '示例物流',
      serial
    )
    assert.equal(row.transactionDate, expected)
  }
})
