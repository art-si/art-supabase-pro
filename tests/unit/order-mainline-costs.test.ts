import assert from 'node:assert/strict'
import test from 'node:test'
import { parseOrderMainlineCosts } from '../../src/api/order-mainline-costs.model'

test('order cost keeps shared-waybill attribution separate from amount', () => {
  const result = parseOrderMainlineCosts({
    total: 1,
    records: [
      {
        id: 'cost-1',
        waybillId: 'waybill-1',
        amount: '***',
        shared: true,
        linkedOrderCount: 2
      }
    ]
  })
  assert.equal(result.data[0].shared, true)
  assert.equal(result.data[0].linkedOrderCount, 2)
  assert.equal(result.data[0].amount, '***')
})

test('order cost rejects inconsistent shared attribution', () => {
  assert.throws(() =>
    parseOrderMainlineCosts({
      total: 1,
      records: [{ id: 'cost-1', waybillId: 'waybill-1', shared: false, linkedOrderCount: 2 }]
    })
  )
})
