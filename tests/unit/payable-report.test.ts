import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isPayableReportResponse,
  payableReportAmountKeys
} from '../../src/utils/finance/payable-report'

const response = () => ({
  mode: 'detail',
  asOfDate: '2026-10-24',
  agingBasis: 'due',
  allocationMode: 'oldest_due',
  total: 1,
  unavailableCount: 0,
  records: [
    {
      id: 'document',
      documentId: 'document',
      documentNo: 'AP-001',
      tenantId: 'tenant',
      accountSetId: 'book',
      partyId: 'supplier',
      partyName: '虚构供应商',
      kind: 'financial',
      partyType: 'supplier',
      currencyCode: 'CNY',
      baseCurrencyCode: 'CNY',
      balanceState: 'ready',
      amountReadable: true,
      documentCount: 1,
      ...Object.fromEntries(payableReportAmountKeys.map((key) => [key, 0]))
    }
  ]
})

test('accepts complete report rows including negative credit balances', () => {
  const data = response()
  Object.assign(data.records[0], { balanceAmount: -100, creditBalance: -100 })
  assert.equal(isPayableReportResponse(data), true)
})

test('rejects non-finite, missing and disguised monetary fields', () => {
  for (const invalid of [undefined, null, NaN, Infinity, '100', '***']) {
    const data = response()
    Object.assign(data.records[0], { balanceAmount: invalid })
    assert.equal(isPayableReportResponse(data), false)
  }
})

test('requires every monetary field to be null for unavailable balances', () => {
  for (const state of ['amount_hidden', 'source_mismatch', 'history_incomplete']) {
    const data = response()
    Object.assign(data.records[0], { balanceState: state, amountReadable: false })
    assert.equal(isPayableReportResponse(data), false)
    Object.assign(
      data.records[0],
      Object.fromEntries(payableReportAmountKeys.map((key) => [key, null]))
    )
    assert.equal(isPayableReportResponse(data), true)
  }
})

test('rejects invalid counts, scopes and detail identity', () => {
  for (const patch of [{ total: -1 }, { total: 0 }, { unavailableCount: -1 }, { mode: 'other' }])
    assert.equal(isPayableReportResponse({ ...response(), ...patch }), false)
  const data = response()
  Object.assign(data.records[0], { documentId: undefined })
  assert.equal(isPayableReportResponse(data), false)
  assert.equal(isPayableReportResponse({ ...data, mode: 'summary' }), true)
})
