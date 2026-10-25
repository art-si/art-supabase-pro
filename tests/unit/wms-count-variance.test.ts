import assert from 'node:assert/strict'
import test from 'node:test'
import { countLineVariance } from '../../modules/art-supabase-wms/src/views/count-business/count/count-variance'

test('quantity counts separate gains and losses', () => {
  const base = {
    expectedQuantity: 8,
    expectedSerialIds: [],
    countedSerialIds: [],
    newSerialNos: [],
    material: null
  }
  assert.deepEqual(countLineVariance({ ...base, countedQuantity: 11 }), { gain: 3, loss: 0 })
  assert.deepEqual(countLineVariance({ ...base, countedQuantity: 5 }), { gain: 0, loss: 3 })
  assert.equal(countLineVariance({ ...base, countedQuantity: null }), null)
})

test('serial replacement shows a gain and loss on the same row', () => {
  assert.deepEqual(
    countLineVariance({
      expectedQuantity: 2,
      countedQuantity: 2,
      expectedSerialIds: ['old-1', 'old-2'],
      countedSerialIds: ['old-1'],
      newSerialNos: ['new-1'],
      material: null
    }),
    { gain: 1, loss: 1 }
  )
})

test('adjustment and recount quantity drive the final non-serial variance', () => {
  const line = {
    expectedQuantity: 10,
    adjustmentQuantity: 2,
    countedQuantity: 8,
    recountQuantity: 13,
    expectedSerialIds: [],
    countedSerialIds: [],
    newSerialNos: [],
    material: null
  }
  assert.deepEqual(countLineVariance(line), { gain: 0, loss: 4 })
  assert.deepEqual(countLineVariance(line, true), { gain: 1, loss: 0 })
  assert.equal(countLineVariance({ ...line, recountQuantity: null }, true), null)
})
