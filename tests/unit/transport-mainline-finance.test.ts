import assert from 'node:assert/strict'
import test from 'node:test'

import { parseOrderMainlineFinance } from '../../src/api/transport-mainline-finance.model'

test('keeps statement amounts masked and never invents an order payment allocation', () => {
  const result = parseOrderMainlineFinance({
    statementsAvailable: true,
    statementTotal: 1,
    statements: [
      {
        id: 'line-1',
        statementId: 'statement-1',
        statementNo: 'DZ-1',
        status: 'approved',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        waybillNo: 'YD-1',
        isActive: true,
        lineAmount: '***'
      }
    ],
    exceptionTotal: 0,
    exceptions: []
  })
  assert.equal(result?.statements[0]?.lineAmount, '***')
  assert.equal(Object.hasOwn(result?.statements[0] ?? {}, 'settledAmount'), false)
})

test('does not accept statement data when authorization is denied', () => {
  const result = parseOrderMainlineFinance({
    statementsAvailable: false,
    statementTotal: 0,
    statements: [],
    exceptionTotal: 0,
    exceptions: []
  })
  assert.equal(result?.statementsAvailable, false)
  assert.deepEqual(result?.statements, [])
  assert.throws(() =>
    parseOrderMainlineFinance({
      statementsAvailable: false,
      statementTotal: 1,
      statements: [{ id: 'incomplete' }],
      exceptionTotal: 0,
      exceptions: []
    })
  )
})
