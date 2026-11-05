import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateSettlementDueDate } from '../../modules/art-supabase-tms/src/views/basic-data/electronic-contract/modules/settlement-due-date'

test('账期从结算结束次月 1 日起按 30 天月计算', () => {
  assert.equal(calculateSettlementDueDate('2026-09-09', 45), '2026-11-15')
  assert.equal(calculateSettlementDueDate('2026-09-09', 30), '2026-10-31')
  assert.equal(calculateSettlementDueDate('2026-09-09', 60), '2026-11-30')
  assert.equal(calculateSettlementDueDate('2026-01-31', 15), '2026-02-15')
})

test('拒绝无效的结束日期或账期', () => {
  assert.equal(calculateSettlementDueDate('', 45), null)
  assert.equal(calculateSettlementDueDate('2026-09-09', 0), null)
  assert.equal(calculateSettlementDueDate('2026-09-09', 2.5), null)
  assert.equal(calculateSettlementDueDate('2026-02-30', 45), null)
  assert.equal(calculateSettlementDueDate('2026-09-09', 3601), null)
})
