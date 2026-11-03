import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isWmsPackComposition,
  type WmsPackComposition
} from '../../modules/art-supabase-wms/src/api/packing-composition'
import { formatWmsPackComposition } from '../../modules/art-supabase-wms/src/views/shared/wms-pack-composition-columns'

const composition: WmsPackComposition = {
  packNo: 'PK-0001',
  packArea: '一区',
  packDetails: [
    { boardId: 'long', area: '一区', boardNo: 'A-1', lengthMm: 7000, pieces: 8 },
    { boardId: 'short', area: '一区', boardNo: 'A-1', lengthMm: 4500, pieces: 3 }
  ]
}

test('mixed package composition keeps number, length and original pieces aligned', () => {
  assert.equal(formatWmsPackComposition(composition, 'boardNo'), 'A-1\nA-1')
  assert.equal(formatWmsPackComposition(composition, 'lengthMm'), '7000\n4500')
  assert.equal(formatWmsPackComposition(composition, 'pieces'), '8\n3')
})

test('unlinked inventory does not infer board pieces from its inventory quantity', () => {
  const unlinked = { packDetails: [], inventoryQuantity: 123.5 }
  assert.equal(formatWmsPackComposition(unlinked, 'pieces'), '—')
  assert.equal(unlinked.inventoryQuantity, 123.5)
  assert.equal(isWmsPackComposition({}), true)
  assert.equal(isWmsPackComposition({ packNo: null, packDetails: null }), true)
})

test('the API boundary rejects malformed composition without changing report quantities', () => {
  const report = { ...composition, inventoryQuantity: 25, amount: 500 }
  assert.equal(isWmsPackComposition(report), true)
  assert.equal(
    isWmsPackComposition({
      ...report,
      packDetails: [{ ...composition.packDetails![0], pieces: '8' }]
    }),
    false
  )
  assert.equal(
    isWmsPackComposition({
      ...report,
      packDetails: [{ ...composition.packDetails![0], lengthMm: Infinity }]
    }),
    false
  )
  assert.equal(isWmsPackComposition({ ...report, packNo: 1 }), false)
  assert.equal(report.inventoryQuantity, 25)
  assert.equal(report.amount, 500)
})
