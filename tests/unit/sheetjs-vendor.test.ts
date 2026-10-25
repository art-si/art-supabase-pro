import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from '../../src/vendor/sheetjs/xlsx.mjs'

test('vendored SheetJS round-trips both supported Excel formats', () => {
  const rows = [
    { 编码: 'A-001', 数量: 12 },
    { 编码: 'B-002', 数量: 5 }
  ]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), '明细')

  for (const bookType of ['xlsx', 'xls'] as const) {
    const bytes = XLSX.write(workbook, { bookType, type: 'buffer' })
    const imported = XLSX.read(bytes, { type: 'buffer' })
    const firstSheet = imported.Sheets[imported.SheetNames[0]]
    assert.deepEqual(XLSX.utils.sheet_to_json(firstSheet), rows, bookType)
  }
})
