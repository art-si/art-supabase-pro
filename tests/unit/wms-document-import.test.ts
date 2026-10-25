import assert from 'node:assert/strict'
import test from 'node:test'
import {
  readWmsDocumentImportRows,
  readWmsMaterialImportRows
} from '../../src/utils/wms/document-import'

test('shared WMS row parsing accepts both headers without changing the source rows', () => {
  const row = Object.freeze({ 物料编码: ' MAT-01 ', 数量: ' 2.5 ', 批号: 'LOT-01' })
  const rows = Object.freeze([row])
  assert.deepEqual(readWmsMaterialImportRows(rows), [
    { row, code: 'MAT-01', fileRow: 2, quantity: 2.5 }
  ])
  assert.deepEqual(readWmsMaterialImportRows([{ materialCode: 'MAT-02', quantity: 3 }])[0], {
    row: { materialCode: 'MAT-02', quantity: 3 },
    code: 'MAT-02',
    fileRow: 2,
    quantity: 3
  })
  assert.equal(row.物料编码, ' MAT-01 ')
})

test('quantity-only imports do not apply unrelated price and tax fields', () => {
  const row = { materialCode: 'MAT', quantity: 1, unitPrice: 'unused', taxRate: 200 }
  assert.equal(readWmsMaterialImportRows([row])[0].quantity, 1)
  assert.throws(() => readWmsDocumentImportRows([row]), /第 2 行单价/)
})

test('priced document imports preserve defaults and explicit zero values', () => {
  assert.deepEqual(readWmsDocumentImportRows([{ materialCode: 'MAT', quantity: 2 }])[0].amounts, {
    quantity: 2,
    unitPrice: 0,
    taxRate: 13
  })
  assert.deepEqual(
    readWmsDocumentImportRows([
      { 物料编码: 'MAT', 数量: '3.5', '单价(元)': '12.34', '税率(%)': 0 }
    ])[0].amounts,
    { quantity: 3.5, unitPrice: 12.34, taxRate: 0 }
  )
})

test('priced document errors retain file-row priority', () => {
  assert.throws(
    () =>
      readWmsDocumentImportRows([
        { materialCode: 'FIRST', quantity: 1, unitPrice: -1 },
        { materialCode: 'SECOND', quantity: 0 }
      ]),
    /第 2 行单价/
  )
  assert.throws(
    () => readWmsDocumentImportRows([{ materialCode: 'MAT', quantity: 1, taxRate: 101 }]),
    /第 2 行税率/
  )
})

test('positive numeric quantities are required consistently', () => {
  for (const quantity of [false, true, [], {}, null, '', ' ', 0, -1, Infinity, NaN]) {
    for (const parse of [readWmsMaterialImportRows, readWmsDocumentImportRows]) {
      assert.throws(() => parse([{ materialCode: 'MAT', quantity }]), /第 2 行数量/)
    }
  }
})

test('row bounds, missing codes and header precedence remain explicit', () => {
  for (const parse of [readWmsMaterialImportRows, readWmsDocumentImportRows]) {
    assert.throws(() => parse([]), /1 至 500 行/)
    assert.throws(
      () => parse(Array.from({ length: 501 }, () => ({ materialCode: 'MAT', quantity: 1 }))),
      /1 至 500 行/
    )
    assert.throws(
      () => parse([{ 物料编码: '', materialCode: 'FALLBACK', quantity: 1 }]),
      /物料编码/
    )
    assert.throws(() => parse([{ materialCode: 'MAT', 数量: '', quantity: 1 }]), /数量/)
  }
})
