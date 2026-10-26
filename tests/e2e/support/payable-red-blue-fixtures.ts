import assert from 'node:assert/strict'
import { appendFileSync, readFileSync } from 'node:fs'
import { expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ensurePayablePostingRule, payableVoucherLines } from './payable-live-posting'
import {
  acceptanceRecord as record,
  acceptanceRows as rows,
  acceptanceIdentifier as identifier,
  acceptanceRpc as rpc,
  payableAcceptanceTenantId as tenantId
} from './payable-live-session'

export interface RedBlueScenario {
  key: string
  keyword: string
  blue: Record<string, unknown>
  credit: Record<string, unknown>
  blueAmount: number
  creditAmount: number
  blueBase: number
  creditBase: number
  blueSubject: string
  creditSubject: string
}

export function redBlueJournal(value: Record<string, unknown>): void {
  appendFileSync('.artifacts/payable-red-blue-live-records.jsonl', JSON.stringify(value) + '\n')
}

async function ensureSubject(
  client: SupabaseClient,
  book: string,
  code: string,
  name: string,
  foreign: boolean
) {
  const response = await client
    .from('fms_subject')
    .select('id,allow_foreign_currency')
    .eq('account_set_id', book)
    .eq('subject_code', code)
  expect(response.error).toBeNull()
  const existing = rows(response.data)[0]
  if (existing) {
    expect(existing.allow_foreign_currency).toBe(foreign)
    return identifier(existing)
  }
  return identifier(
    record(
      await rpc(client, 'save_fms_subject', {
        p_payload: {
          tenantId,
          accountSetId: book,
          subjectCode: code,
          subjectName: name,
          category: code === '6603' ? 'expense' : 'liability',
          balanceDirection: code === '6603' ? 'debit' : 'credit',
          isEnabled: true,
          allowForeignCurrency: foreign,
          cashFlowRequired: false,
          remark: '独立红蓝核销验收专用，不修改已使用科目'
        }
      })
    )
  )
}

export async function redBluePayable(client: SupabaseClient, id: string) {
  const document = rows(
    record(
      await rpc(client, 'fms_purchase_payable_list_secure', {
        p_kind: 'financial',
        p_id: id,
        p_limit: 1
      })
    ).data
  )[0]
  assert.ok(document && document.tenant_id === tenantId)
  return document
}

async function ensurePayable(
  client: SupabaseClient,
  context: Record<string, unknown>,
  typeId: string,
  supplierId: string,
  marker: string,
  keyword: string,
  amount: number,
  tax: number,
  currency: string,
  rate: number,
  credit: boolean
) {
  const prior = await client
    .from('fms_purchase_payable_document')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('kind', 'financial')
    .contains('details', { invoice_no: marker })
  expect(prior.error).toBeNull()
  expect(rows(prior.data).length).toBeLessThanOrEqual(1)
  const id = prior.data?.length
    ? identifier(rows(prior.data)[0])
    : identifier(
        record(
          await rpc(client, 'fms_save_purchase_payable_secure', {
            p_document: {
              kind: 'financial',
              tenant_id: tenantId,
              document_type_id: typeId,
              supplier_id: supplierId,
              organization_id: context.organizationId,
              business_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(
                new Date()
              ),
              currency_code: currency,
              exchange_rate: rate,
              is_credit: credit,
              input_tax_inclusive_price: false,
              invoice_no: marker,
              remark: keyword,
              lines: [
                {
                  material_id: context.materialId,
                  inventory_unit_id: context.inventoryUnitId,
                  quantity: 1,
                  unit_price: amount,
                  tax_rate: tax
                }
              ]
            }
          })
        )
      )
  redBlueJournal({ kind: 'source', marker, id })
  let document = await redBluePayable(client, id)
  for (const status of ['draft', 'submitted']) {
    if (document.status !== status) continue
    await rpc(client, 'fms_act_purchase_payable_secure', {
      p_ids: [id],
      p_action: status === 'draft' ? 'submit' : 'approve'
    })
    document = await redBluePayable(client, id)
  }
  expect(document.status).toBe('approved')
  expect(document.currency_code).toBe(currency)
  expect(Number(document.exchange_rate)).toBe(rate)
  return document
}

export async function prepareRedBlueScenarios(client: SupabaseClient): Promise<RedBlueScenario[]> {
  const context = record(JSON.parse(readFileSync('.artifacts/apar-live-context.json', 'utf8')))
  expect(context.tenantId).toBe(tenantId)
  assert.ok(typeof context.bookId === 'string')
  const book = context.bookId
  const subjects = await client
    .from('fms_subject')
    .select('id,subject_code')
    .eq('account_set_id', book)
  expect(subjects.error).toBeNull()
  const subject = (code: string) =>
    identifier(rows(subjects.data).find((entry) => entry.subject_code === code))
  const blueFx = await ensureSubject(client, book, '220299', '验收外币采购应付', true)
  const creditFx = await ensureSubject(client, book, '224199', '验收外币其他应付', true)
  const exchange = await ensureSubject(client, book, '6603', '验收汇兑损益', false)
  const sourceLines = (liability: string, taxed: boolean) => [
    { direction: 'debit', amountKey: 'net_amount', subjectId: subject('1405') },
    ...(taxed ? [{ direction: 'debit', amountKey: 'tax_amount', subjectId: subject('2221') }] : []),
    { direction: 'credit', amountKey: 'gross_amount', subjectId: liability }
  ]
  await ensurePayablePostingRule(
    client,
    book,
    'QA_RB_CNY_SOURCE',
    'approved',
    { document_type_code: 'AP_FIN_EXPENSE', is_credit: false, currency_code: 'CNY' },
    sourceLines(subject('2202'), true)
  )
  await ensurePayablePostingRule(
    client,
    book,
    'QA_RB_USD_SOURCE',
    'approved',
    { document_type_code: 'AP_FIN_EXPENSE', is_credit: false, currency_code: 'USD' },
    sourceLines(blueFx, false)
  )
  await ensurePayablePostingRule(
    client,
    book,
    'QA_RB_EUR_SOURCE',
    'approved',
    { document_type_code: 'AP_FIN_OTHER', is_credit: true, currency_code: 'EUR' },
    sourceLines(creditFx, false)
  )
  for (const [code, primary, secondary, debit, credit] of [
    ['CNY', 'CNY', 'CNY', subject('2202'), subject('2241')],
    ['FX', 'USD', 'EUR', blueFx, creditFx]
  ])
    await ensurePayablePostingRule(
      client,
      book,
      `QA_RB_${code}_OFFSET`,
      'ap_red_blue_offset_approved',
      {
        writeoff_relation: 'payable_red_blue',
        primary_currency_code: primary,
        secondary_currency_code: secondary
      },
      [
        { direction: 'debit', amountKey: 'payable_base_amount', subjectId: debit },
        { direction: 'credit', amountKey: 'credit_base_amount', subjectId: credit },
        { direction: 'debit', amountKey: 'exchange_gain_loss', subjectId: exchange }
      ]
    )
  const types = await client
    .from('mdm_document_type')
    .select('id,document_type_code')
    .eq('tenant_id', tenantId)
    .in('document_type_code', ['AP_FIN_OTHER', 'AP_FIN_EXPENSE'])
  expect(types.error).toBeNull()
  const expense = identifier(
    rows(types.data).find((entry) => entry.document_type_code === 'AP_FIN_EXPENSE')
  )
  const other = identifier(
    rows(types.data).find((entry) => entry.document_type_code === 'AP_FIN_OTHER')
  )
  const fixtures = rows(context.cases)
  const cnyBlue = await ensurePayable(
    client,
    context,
    expense,
    String(fixtures[0].supplierId),
    'QA-RB-BLUE-CNY',
    'QA-CREDIT-UI-1',
    50,
    13,
    'CNY',
    1,
    false
  )
  const cnyCredit = await redBluePayable(client, '16cd5861-c7f2-45d1-b453-f71a78ddc624')
  const fxBlue = await ensurePayable(
    client,
    context,
    expense,
    String(fixtures[1].supplierId),
    'QA-RB-BLUE-FX',
    'QA-RB-FX',
    100,
    0,
    'USD',
    7,
    false
  )
  const fxCredit = await ensurePayable(
    client,
    context,
    other,
    String(fixtures[1].supplierId),
    'QA-RB-CREDIT-FX',
    'QA-RB-FX',
    90,
    0,
    'EUR',
    8,
    true
  )
  for (const document of [cnyBlue, cnyCredit, fxBlue, fxCredit]) {
    const result = record(
      await rpc(client, 'fms_payable_voucher_secure', { p_id: identifier(document) })
    )
    expect(result.status).toBe('generated')
    assert.ok(typeof result.voucher_id === 'string')
    const entries = await payableVoucherLines(client, result.voucher_id)
    const expected =
      document.id === cnyBlue.id
        ? '2202'
        : document.id === cnyCredit.id
          ? '2241'
          : document.id === fxBlue.id
            ? '220299'
            : '224199'
    const liability = entries.find((entry) => entry.subject_code_snapshot === expected)
    assert.ok(liability)
    expect(Number(liability[document.is_credit ? 'debit_amount' : 'credit_amount'])).toBe(
      Math.abs(Number(document.base_total_amount))
    )
    if (document.currency_code !== 'CNY') {
      expect(liability.currency_code_snapshot).toBe(document.currency_code)
      expect(Number(liability.original_amount)).toBe(Math.abs(Number(document.total_amount)))
      expect(Number(liability.exchange_rate)).toBe(Number(document.exchange_rate))
    }
  }
  return [
    {
      key: 'CNY',
      keyword: 'QA-CREDIT-UI-1',
      blue: cnyBlue,
      credit: cnyCredit,
      blueAmount: 56.5,
      creditAmount: 56.5,
      blueBase: 56.5,
      creditBase: 56.5,
      blueSubject: '2202',
      creditSubject: '2241'
    },
    {
      key: 'FX',
      keyword: 'QA-RB-FX',
      blue: fxBlue,
      credit: fxCredit,
      blueAmount: 100,
      creditAmount: 90,
      blueBase: 700,
      creditBase: 720,
      blueSubject: '220299',
      creditSubject: '224199'
    }
  ]
}
