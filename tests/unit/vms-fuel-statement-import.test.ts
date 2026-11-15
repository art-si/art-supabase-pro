import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseFuelStatementRows } from '../../modules/art-supabase-vms/src/views/vehicle-manage/fuel-card-ledger/modules/fuel-statement-import'

test('加油站 CSV 列名映射并保留来源行证据', () => {
  const source = {
    油卡号: ' VMS-QA-20261026-001 ',
    消费时间: '2026-10-27 10:15:00',
    金额: '25.00',
    加油升数: '10',
    加油站: 'QA测试加油站'
  }
  const rows = parseFuelStatementRows([source])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].sourceRow, 2)
  assert.equal(rows[0].cardNo, 'VMS-QA-20261026-001')
  assert.equal(rows[0].amount, 25)
  assert.equal(rows[0].liters, 10)
  assert.equal(rows[0].stationName, 'QA测试加油站')
  assert.equal(rows[0].rawRow, source)
  assert.ok(Number.isFinite(Date.parse(rows[0].occurredAt)))
})

test('缺少卡号或无效金额会阻止整批导入', () => {
  assert.throws(
    () =>
      parseFuelStatementRows([
        {
          油卡号: 'VMS-QA-20261026-001',
          消费时间: '2026-10-27 10:15:00',
          金额: 25,
          加油站: 'QA测试加油站'
        },
        { 油卡号: '', 消费时间: '2026-10-27 11:00:00', 金额: 42, 加油站: 'QA测试加油站' }
      ]),
    /第 3 行缺少卡号/
  )
  assert.throws(
    () =>
      parseFuelStatementRows([
        { 油卡号: 'VMS-QA-20261026-001', 消费时间: '2026-10-27', 金额: -2, 加油站: 'QA测试加油站' }
      ]),
    /第 2 行金额无效/
  )
})

const validStatementRow = {
  油卡号: 'VMS-QA-20261026-001',
  消费时间: '2026-10-27 10:15:00',
  金额: 25,
  加油站: 'QA测试加油站'
}

test('布尔值不能作为对账金额或加油升数', () => {
  for (const field of ['金额', '加油升数'] as const) {
    assert.throws(
      () => parseFuelStatementRows([validStatementRow, { ...validStatementRow, [field]: true }]),
      new RegExp(`第 3 行${field}无效`)
    )
  }
})

test('非法千分组及混用的数字分隔符会阻止导入', () => {
  for (const [field, value] of [
    ['金额', '12,34'],
    ['金额', '1.234,56'],
    ['加油升数', '2,0'],
    ['加油升数', '1,234,56']
  ] as const) {
    assert.throws(
      () => parseFuelStatementRows([{ ...validStatementRow, [field]: value }]),
      new RegExp(`第 2 行${field}无效`)
    )
  }
})

test('对账导入支持标准千分组和空油量，拒绝金额或油量为零', () => {
  const rows = parseFuelStatementRows([
    { ...validStatementRow, 金额: ' 1,234.56 ', 加油升数: '1,234,567.89' },
    { ...validStatementRow, 金额: '25.00', 加油升数: '  ' }
  ])
  assert.deepEqual(
    rows.map(({ amount, liters }) => [amount, liters]),
    [
      [1234.56, 1234567.89],
      [25, null]
    ]
  )
  assert.throws(
    () => parseFuelStatementRows([{ ...validStatementRow, 金额: 0 }]),
    /第 2 行金额无效/
  )
  assert.throws(
    () => parseFuelStatementRows([{ ...validStatementRow, 加油升数: '0' }]),
    /第 2 行加油升数无效/
  )
})

test('超过 500 行的账单必须拆分', () => {
  assert.throws(() => parseFuelStatementRows(Array.from({ length: 501 }, () => ({}))), /500 行/)
})

test('XLSX 首张工作表的明细可解析并进入导入预览', async () => {
  const XLSX = await import('../../src/vendor/sheetjs/xlsx.mjs')
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['油卡号', '消费时间', '金额', '加油升数', '加油站'],
      ['VMS-QA-20261026-001', '2026-10-27 10:15:00', 25, 10, 'QA测试加油站'],
      ['VMS-QA-20261026-002', '2026-10-27 11:20:00', 42, 14, 'QA测试加油站']
    ]),
    '站点对账单'
  )
  const binary = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
  const parsed = XLSX.read(binary, { type: 'buffer' })
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    parsed.Sheets[parsed.SheetNames[0]]
  )
  const rows = parseFuelStatementRows(records)
  assert.deepEqual(
    rows.map((row) => [row.sourceRow, row.cardNo, row.amount, row.stationName]),
    [
      [2, 'VMS-QA-20261026-001', 25, 'QA测试加油站'],
      [3, 'VMS-QA-20261026-002', 42, 'QA测试加油站']
    ]
  )
})
