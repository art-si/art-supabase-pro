import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createTransferStockCandidateLoader,
  readTransferStockImportRows
} from '../../modules/art-supabase-wms/src/views/transfer-business/shared/transfer-stock-import'

test('transfer stock import validates and normalizes the complete batch', () => {
  assert.deepEqual(
    readTransferStockImportRows([
      { 物料编码: ' MAT-01 ', 批次号: ' LOT-01 ', 数量: '2.5' },
      { materialCode: 'MAT-02', batchNo: 'LOT-02', quantity: 3 }
    ]),
    [
      { materialCode: 'MAT-01', batchNo: 'LOT-01', quantity: 2.5, fileRow: 1 },
      { materialCode: 'MAT-02', batchNo: 'LOT-02', quantity: 3, fileRow: 2 }
    ]
  )
})

for (const quantity of [true, false, '', ' ', 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`transfer stock import rejects invalid quantity ${String(quantity)}`, () => {
    assert.throws(
      () => readTransferStockImportRows([{ 物料编码: 'MAT-01', 批次号: 'LOT-01', 数量: quantity }]),
      /第 1 行须填写物料编码、批次号和正数数量/
    )
  })
}

test('transfer stock import reports a later invalid row before callers perform reads', () => {
  assert.throws(
    () =>
      readTransferStockImportRows([
        { materialCode: 'MAT-01', batchNo: 'LOT-01', quantity: 1 },
        { materialCode: 'MAT-02', batchNo: '', quantity: 1 }
      ]),
    /第 2 行须填写物料编码、批次号和正数数量/
  )
})

test('transfer stock import reuses only exact material and batch lookups', async () => {
  const calls: string[] = []
  const load = createTransferStockCandidateLoader(async (materialCode, batchNo) => {
    calls.push(`${materialCode}/${batchNo}`)
    return [{ materialCode, batchNo }]
  })
  const first = load('MAT-01', 'LOT-01')
  const duplicate = load('MAT-01', 'LOT-01')
  const otherBatch = load('MAT-01', 'LOT-02')
  assert.equal(first, duplicate)
  assert.notEqual(first, otherBatch)
  assert.deepEqual(await first, [{ materialCode: 'MAT-01', batchNo: 'LOT-01' }])
  assert.deepEqual(await otherBatch, [{ materialCode: 'MAT-01', batchNo: 'LOT-02' }])
  assert.deepEqual(calls, ['MAT-01/LOT-01', 'MAT-01/LOT-02'])
})
