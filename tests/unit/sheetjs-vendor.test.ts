import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import * as XLSX from '../../src/vendor/sheetjs/xlsx.mjs'

test('vendored SheetJS matches the documented official release digest', async () => {
  const [source, documentation] = await Promise.all([
    readFile(new URL('../../src/vendor/sheetjs/xlsx.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../src/vendor/sheetjs/README.md', import.meta.url), 'utf8')
  ])
  const digest = documentation.match(/SHA-256[^\n]+`([a-f0-9]{64})`/)
  assert.ok(digest, 'Document the complete SHA-256 digest with 64 hexadecimal characters')
  assert.equal(XLSX.version, '0.20.3')
  assert.equal(createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex'), digest[1])
})

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
