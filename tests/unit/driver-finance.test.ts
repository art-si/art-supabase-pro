import assert from 'node:assert/strict'
import test from 'node:test'
import { parseDriverFinancePage } from '../../src/api/driver-finance.model'

test('driver reimbursement keeps already masked amount and only known fields', () => {
  const result = parseDriverFinancePage(
    {
      total: 1,
      records: [
        {
          id: 'reimbursement-1',
          no: 'BX001',
          occurredOn: '2026-10-27',
          status: 'approved',
          amount: '***',
          relatedNo: 'JK001',
          payeeAccount: 'secret'
        }
      ]
    },
    'reimbursement'
  )
  assert.equal(result.records[0].amount, '***')
  assert.equal(result.records[0].relatedNo, 'JK001')
  assert.equal('payeeAccount' in result.records[0], false)
})

test('driver finance page rejects malformed pagination and amount', () => {
  assert.throws(() => parseDriverFinancePage({ total: -1, records: [] }, 'loan'))
  assert.throws(() =>
    parseDriverFinancePage({ total: 1, records: [{ id: 'x', amount: {} }] }, 'loan')
  )
})
