import { expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  acceptanceRecord as record,
  acceptanceRows as rows,
  acceptanceRpc as rpc
} from './payable-live-session'

export async function ensurePayablePostingRule(
  client: SupabaseClient,
  book: string,
  code: string,
  event: string,
  conditions: Record<string, unknown>,
  lines: Array<Record<string, unknown>>
): Promise<void> {
  const existing = rows(
    record(
      await rpc(client, 'fms_list_posting_rules_secure', {
        p_account_set_id: book,
        p_keyword: code
      })
    ).records
  ).find((entry) => entry.rule_code === code)
  if (existing) {
    expect(existing.is_enabled).toBe(true)
    expect(existing.match_conditions).toEqual(conditions)
    return
  }
  await rpc(client, 'save_fms_posting_rule_secure', {
    p_payload: {
      accountSetId: book,
      ruleCode: code,
      ruleName: `独立应付验收 ${code}`,
      sourceType: event === 'approved' ? 'financial_payable' : 'system',
      eventCode: event,
      voucherType: 'transfer',
      submissionMode: 'draft',
      priority: 1100,
      matchConditions: conditions,
      isEnabled: true,
      lines: lines.map((line, index) => ({
        lineNo: (index + 1) * 10,
        amountMultiplier: 1,
        summary: '独立验收，按来源原币及本位币核对',
        auxiliaryBindings: {},
        ...line
      }))
    }
  })
}

export async function payableVoucherLines(
  client: SupabaseClient,
  voucherId: string
): Promise<Array<Record<string, unknown>>> {
  const voucher = record(await rpc(client, 'fms_get_voucher_secure', { p_voucher_id: voucherId }))
  expect(voucher.status).toBe('draft')
  const entries = rows(voucher.lines)
  expect(entries.reduce((total, entry) => total + Number(entry.debit_amount), 0)).toBeCloseTo(
    entries.reduce((total, entry) => total + Number(entry.credit_amount), 0),
    2
  )
  return entries
}
