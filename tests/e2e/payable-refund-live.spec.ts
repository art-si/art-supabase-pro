import assert from 'node:assert/strict'
import { appendFileSync, readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertPayableAcceptanceSession,
  acceptanceRows as rows,
  acceptanceIdentifier as identifier,
  acceptanceRpc as rpc,
  payableAcceptanceTenantId
} from './support/payable-live-session'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { prepareAppearance } from './support/appearance'

const enabled = process.env.E2E_PAYABLE_LIVE === 'true'
test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-real.storage.json'
    : { cookies: [], origins: [] },
  trace: 'off',
  actionTimeout: 20_000
})
test.skip(!enabled, '仅显式运行独立验收租户真实退款测试')
test.setTimeout(360_000)

function documentIdentity(value: unknown): { id: string; documentNo: string } {
  assert.ok(
    value &&
      typeof value === 'object' &&
      'id' in value &&
      typeof value.id === 'string' &&
      'document_no' in value &&
      typeof value.document_no === 'string'
  )
  return { id: value.id, documentNo: value.document_no }
}
async function resumeSource(client: SupabaseClient, id: string) {
  const response = await client
    .from('fms_payable_settlement_document')
    .select('id,document_no,status,reason,tenant_id')
    .eq('id', id)
    .single()
  expect(response.error).toBeNull()
  expect(response.data?.tenant_id).toBe(payableAcceptanceTenantId)
  expect(response.data?.status).toBe('confirmed')
  expect(response.data?.reason).toMatch(/^退款全流程验收-/)
  return documentIdentity(response.data)
}
async function resumeMatchingDocument(
  client: SupabaseClient,
  kind: 'payment' | 'refund',
  id: string
): Promise<Record<string, unknown>> {
  const list = rows([
    await rpc(client, 'fms_payable_settlement_list_secure', {
      p_kind: kind,
      p_query: { id, current: 1, size: 1 }
    })
  ])[0]
  const document = rows(list.data)[0]
  expect(document.tenant_id).toBe(payableAcceptanceTenantId)
  expect(document.kind).toBe(kind)
  expect(document.status).toBe('confirmed')
  if (kind === 'payment') expect(document.reason).toMatch(/^付款冲退款验收-/)
  return document
}
async function openRecord(
  page: Page,
  kind: 'payment' | 'payment-refund',
  id: string,
  number: string
) {
  const response = page.waitForResponse(
    (item) => item.url().endsWith('/rpc/fms_payable_settlement_list_secure'),
    { timeout: 90_000 }
  )
  await page.goto(`#/fms/accounts-payable/${kind}?recordId=${id}`, {
    waitUntil: 'domcontentloaded'
  })
  expect((await response).ok()).toBe(true)
  const row = page.locator('.art-table-query tbody tr').filter({ hasText: number })
  await expect(row).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
  return row
}
async function act(page: Page, action: '提交' | '审核'): Promise<void> {
  const pending = page.waitForResponse((response) =>
    response.url().endsWith('/rpc/fms_act_payable_settlement_secure')
  )
  await page.getByRole('button', { name: action, exact: true }).click()
  expect((await pending).ok()).toBe(true)
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
}
async function reasonAction(page: Page, action: '取消到账' | '作废未到账单'): Promise<void> {
  if (action === '取消到账') {
    await page.getByRole('button', { name: '确认到账', exact: true }).click()
    await page.getByRole('menuitem', { name: action, exact: true }).click()
  } else await page.getByRole('button', { name: action, exact: true }).click()
  const reason = page.getByRole('dialog', { name: '处理原因', exact: true })
  await reason.getByRole('textbox').fill('独立验收租户退款全流程，保留资金冲回与操作历史')
  const pending = page.waitForResponse((response) =>
    response.url().endsWith('/rpc/fms_act_payable_settlement_secure')
  )
  await reason.getByRole('button', { name: '确定', exact: true }).click()
  expect((await pending).ok()).toBe(true)
}

test('两笔真实付款退款下推、手工新增、编辑、审核、到账、取消与作废', async ({
  page,
  context
}, info) => {
  const client = await assertPayableAcceptanceSession(context)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  const raw = await rpc(client, 'fms_payable_settlement_options_secure', {
    p_kind: 'payment',
    p_tenant_id: payableAcceptanceTenantId
  })
  assert.ok(
    raw &&
      typeof raw === 'object' &&
      'supplier' in raw &&
      'purpose' in raw &&
      'method' in raw &&
      'fund' in raw &&
      'document_type' in raw
  )
  const supplier = identifier(rows(raw.supplier)[0])
  const purpose = identifier(
    rows(raw.purpose).find(
      (item) => item.business_type === 'advance' && item.payable_writeoff === true
    )
  )
  const method = identifier(rows(raw.method).find((item) => item.category === 'cash'))
  const fund = identifier(
    rows(raw.fund).find((item) => item.category === 'cash' && item.currency_code === 'CNY')
  )
  const documentType = identifier(rows(raw.document_type).find((item) => item.is_default === true))
  const run = Date.now().toString(36).toUpperCase()
  for (let index = 1; index <= 2; index += 1) {
    const resumed = index === 1 ? process.env.E2E_REFUND_SOURCE_ID : undefined
    const source = resumed
      ? await resumeSource(client, resumed)
      : documentIdentity(
          await rpc(client, 'fms_save_payable_settlement_secure', {
            p_document: {
              kind: 'payment',
              document_type_id: documentType,
              currency_code: 'CNY',
              reason: `退款全流程验收-${run}-${index}`,
              details: { fee: index === 1 ? 5 : 0 },
              lines: [
                {
                  purpose_id: purpose,
                  supplier_id: supplier,
                  payee_supplier_id: supplier,
                  settlement_method_id: method,
                  fund_account_id: fund,
                  amount: 90,
                  cash_discount: 10
                }
              ]
            }
          })
        )
    appendFileSync(
      '.artifacts/payable-refund-live-records.jsonl',
      JSON.stringify({ ...source, kind: 'source_payment', run }) + '\n'
    )
    for (const action of resumed ? [] : ['submit', 'approve', 'confirm'])
      await rpc(client, 'fms_act_payable_settlement_secure', {
        p_ids: [source.id],
        p_action: action
      })
    let refund: { id: string; documentNo: string }
    if (index === 1) {
      const sourceRow = await openRecord(page, 'payment', source.id, source.documentNo)
      await sourceRow.locator('.el-checkbox').first().click()
      await page.getByRole('button', { name: '下推', exact: true }).click()
      const pushed = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_push_payable_settlement_secure')
      )
      await page.getByRole('menuitem', { name: '付款退款单', exact: true }).click()
      const response = await pushed
      expect(response.ok()).toBe(true)
      refund = documentIdentity(await response.json())
    } else {
      await page.goto('#/fms/accounts-payable/payment-refund', { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: '付款退款单', exact: true })).toBeVisible({
        timeout: 60_000
      })
      await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
      await page.getByRole('button', { name: '新增', exact: true }).click()
      const drawer = page.getByRole('dialog', { name: '新增付款退款单', exact: true })
      await drawer.getByRole('button', { name: '新增明细', exact: true }).click()
      await drawer.getByRole('combobox', { name: '原付款明细', exact: true }).click()
      await page.getByRole('option', { name: new RegExp(source.documentNo) }).click()
      await captureBusinessEvidence(drawer, { path: info.outputPath('refund-manual-new.png') })
      const saved = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_save_payable_settlement_secure')
      )
      await drawer.getByRole('button', { name: '保存', exact: true }).click()
      const response = await saved
      expect(response.ok()).toBe(true)
      refund = documentIdentity(await response.json())
    }
    appendFileSync(
      '.artifacts/payable-refund-live-records.jsonl',
      JSON.stringify({ ...refund, sourceId: source.id, kind: 'refund', run }) + '\n'
    )
    let refundRow = await openRecord(page, 'payment-refund', refund.id, refund.documentNo)
    await refundRow.getByRole('button', { name: '编辑', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '编辑付款退款单', exact: true })
    const amount = index === 1 ? 45 : 90
    await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
    await editor.getByRole('spinbutton', { name: '退款本金', exact: true }).fill(String(amount))
    await editor
      .getByRole('spinbutton', { name: '失效折扣', exact: true })
      .fill(index === 1 ? '5' : '0')
    const saved = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_save_payable_settlement_secure')
    )
    await editor.getByRole('button', { name: '保存', exact: true }).click()
    expect((await saved).ok()).toBe(true)
    await expect(editor).not.toBeVisible()
    refundRow = await openRecord(page, 'payment-refund', refund.id, refund.documentNo)
    await refundRow.locator('.el-checkbox').first().click()
    await act(page, '提交')
    await expect(refundRow).toContainText('已提交')
    await refundRow.locator('.el-checkbox').first().click()
    await act(page, '审核')
    await expect(refundRow).toContainText('已审核')
    await refundRow.locator('.el-checkbox').first().click()
    await page.getByRole('button', { name: '确认到账', exact: true }).click()
    await page.getByRole('menuitem', { name: '确认到账', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: '确认退款到账', exact: true })
    const confirmed = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_act_payable_settlement_secure')
    )
    await confirmation.getByRole('button', { name: '确认登记', exact: true }).click()
    expect((await confirmed).ok()).toBe(true)
    await expect(refundRow).toContainText('已确认到账')
    await expect(refundRow).toContainText('全部到账')
    const executions = await client
      .from('fms_payable_payment_execution')
      .select('amount,status,account_set_id')
      .eq('document_id', refund.id)
    expect(executions.error).toBeNull()
    expect(executions.data).toHaveLength(1)
    expect(Number(executions.data?.[0].amount)).toBe(amount)
    expect(executions.data?.[0].status).toBe('posted')
    await captureBusinessEvidence(page, { path: info.outputPath(`refund-confirmed-${index}.png`) })
    await refundRow.getByRole('button', { name: '查看', exact: true }).click()
    const detail = page.getByRole('dialog', { name: '查看付款退款单', exact: true })
    await expect(detail.locator('.el-skeleton')).toHaveCount(0)
    await expect(detail).toContainText(source.documentNo)
    await detail.getByText('退款金额说明', { exact: true }).scrollIntoViewIfNeeded()
    await captureBusinessEvidence(detail, { path: info.outputPath(`refund-detail-${index}.png`) })
    await detail.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    await refundRow.locator('.el-checkbox').first().click()
    await reasonAction(page, '取消到账')
    await expect(refundRow).toContainText('已审核')
    await refundRow.locator('.el-checkbox').first().click()
    await reasonAction(page, '作废未到账单')
    await expect(refundRow).toContainText('已取消')
    await rpc(client, 'fms_act_payable_settlement_secure', {
      p_ids: [source.id],
      p_action: 'cancel_payment',
      p_reason: '退款全流程验收完成，冲回验收原付款资金流水'
    })
  }
  expect(errors).toEqual([])
})

test('两笔真实付款冲退款手工与自动核销、历史联查和反核销', async ({ page, context }, info) => {
  const client = await assertPayableAcceptanceSession(context)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  const raw = rows([
    await rpc(client, 'fms_payable_settlement_options_secure', {
      p_kind: 'payment',
      p_tenant_id: payableAcceptanceTenantId
    })
  ])[0]
  const supplier = identifier(rows(raw.supplier)[0])
  const purpose = identifier(
    rows(raw.purpose).find(
      (item) => item.business_type === 'advance' && item.payable_writeoff === true
    )
  )
  const method = identifier(rows(raw.method).find((item) => item.category === 'cash'))
  const fund = identifier(
    rows(raw.fund).find((item) => item.category === 'cash' && item.currency_code === 'CNY')
  )
  const documentType = identifier(rows(raw.document_type).find((item) => item.is_default === true))
  const schemes = rows(await rpc(client, 'fms_payable_reference_list_secure', { p_kind: 'scheme' }))
  const autoScheme = schemes.find((item) => item.code === 'AP-SAME-SOURCE')
  assert.ok(autoScheme && typeof autoScheme.name === 'string')
  const run = Date.now().toString(36).toUpperCase()
  for (let index = 1; index <= 2; index += 1) {
    const amount = index === 1 ? 45 : 90
    const resumed =
      index === 2 && Boolean(process.env.E2E_RRF_SOURCE_ID && process.env.E2E_RRF_REFUND_ID)
    const sourceRaw = resumed
      ? await resumeMatchingDocument(client, 'payment', process.env.E2E_RRF_SOURCE_ID || '')
      : rows([
          await rpc(client, 'fms_save_payable_settlement_secure', {
            p_document: {
              kind: 'payment',
              document_type_id: documentType,
              currency_code: 'CNY',
              reason: `付款冲退款验收-${run}-${index}`,
              lines: [
                {
                  purpose_id: purpose,
                  supplier_id: supplier,
                  payee_supplier_id: supplier,
                  settlement_method_id: method,
                  fund_account_id: fund,
                  amount: 90,
                  cash_discount: 10
                }
              ]
            }
          })
        ])[0]
    const source = documentIdentity(sourceRaw)
    appendFileSync(
      '.artifacts/payable-refund-matching-live-records.jsonl',
      JSON.stringify({ ...source, kind: 'source_payment', provider: 'supabase', run }) + '\n'
    )
    for (const action of resumed ? [] : ['submit', 'approve', 'confirm'])
      await rpc(client, 'fms_act_payable_settlement_secure', {
        p_ids: [source.id],
        p_action: action
      })
    const refundRaw = resumed
      ? await resumeMatchingDocument(client, 'refund', process.env.E2E_RRF_REFUND_ID || '')
      : rows([
          await rpc(client, 'fms_push_payable_settlement_secure', {
            p_id: source.id,
            p_kind: 'refund',
            p_source: 'payment'
          })
        ])[0]
    const refund = documentIdentity(refundRaw)
    const refundLines = rows(refundRaw.lines)
    if (resumed) {
      expect(refundLines[0].refund_payment_line_id).toBe(identifier(rows(sourceRaw.lines)[0]))
      expect(Number(refundLines[0].amount)).toBe(amount)
    }
    if (!resumed)
      await rpc(client, 'fms_save_payable_settlement_secure', {
        p_document: {
          ...refundRaw,
          lines: refundLines.map((line) => ({
            ...line,
            amount,
            approved_amount: amount,
            planned_amount: amount,
            expired_discount_amount: index === 1 ? 5 : 0
          }))
        }
      })
    for (const action of resumed ? [] : ['submit', 'approve', 'confirm'])
      await rpc(client, 'fms_act_payable_settlement_secure', {
        p_ids: [refund.id],
        p_action: action
      })
    appendFileSync(
      '.artifacts/payable-refund-matching-live-records.jsonl',
      JSON.stringify({
        ...refund,
        sourceId: source.id,
        kind: 'refund',
        provider: 'supabase',
        run
      }) + '\n'
    )
    const loaded = page.waitForResponse(
      (response) => response.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure'),
      { timeout: 90_000 }
    )
    if (page.url().endsWith('#/fms/accounts-payable/writeoff')) {
      const refresh = page.getByRole('button', { name: '刷新', exact: true })
      await expect(refresh).toBeEnabled()
      await refresh.click()
      await expect(page.locator('.el-skeleton')).toHaveCount(0)
    } else await page.goto('#/fms/accounts-payable/writeoff', { waitUntil: 'domcontentloaded' })
    expect((await loaded).ok()).toBe(true)
    await expect(page.getByRole('heading', { name: '应付核销工作台', exact: true })).toBeVisible({
      timeout: 60_000
    })
    await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
    const guide = page.getByRole('button', { name: '知道了', exact: true })
    if (await guide.isVisible()) await guide.click()
    const refundMode = page.getByRole('radio', { name: '付款冲退款', exact: true })
    if (!(await refundMode.isChecked())) {
      const switched = page.waitForResponse(
        (response) =>
          response.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure') &&
          response.request().postDataJSON()?.p_query?.relation === 'payment_refund'
      )
      await refundMode.locator('..').click()
      expect((await switched).ok()).toBe(true)
    }
    await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
    await page.getByRole('tab', { name: '待核销单据', exact: true }).click()
    const primaryRow = page
      .locator('[aria-label="付款单"] tbody tr')
      .filter({ hasText: source.documentNo })
    const secondaryRow = page
      .locator('[aria-label="付款退款单"] tbody tr')
      .filter({ hasText: refund.documentNo })
    await expect(primaryRow).toBeVisible()
    await expect(secondaryRow).toBeVisible()
    await expect(secondaryRow).toContainText(source.documentNo)
    if (index === 1) {
      await primaryRow.getByRole('spinbutton').fill(String(amount))
      await primaryRow.locator('.el-checkbox').first().click()
      await secondaryRow.locator('.el-checkbox').first().click()
      await page.getByRole('button', { name: '核销', exact: true }).click()
      const confirmation = page.getByRole('dialog', { name: '核销确认', exact: true })
      await captureBusinessEvidence(page, {
        path: info.outputPath('refund-writeoff-manual-confirm.png')
      })
      const written = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_payable_writeoff_secure')
      )
      await confirmation.getByRole('button', { name: '执行核销', exact: true }).click()
      const response = await written
      expect(response.ok()).toBe(true)
      expect(response.request().postDataJSON()?.p_items).toEqual([
        {
          relation: 'payment_refund',
          payment_line_id: identifier(rows(sourceRaw.lines)[0]),
          refund_line_id: identifier(refundLines[0]),
          amount
        }
      ])
    } else {
      await page.getByRole('combobox', { name: '核销方案', exact: true }).click()
      await page.getByRole('option', { name: autoScheme.name, exact: true }).click()
      const planned = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_auto_payable_writeoff_secure')
      )
      await page.getByRole('button', { name: '按方案自动核销', exact: true }).click()
      const preview = await planned
      expect(preview.ok()).toBe(true)
      const plan = rows([await preview.json()])[0]
      expect(Number(plan.total_amount)).toBe(amount)
      expect(rows(plan.items)).toHaveLength(1)
      const dialog = page.getByRole('dialog', { name: '按方案自动核销', exact: true })
      await expect(dialog).toContainText(source.documentNo)
      await expect(dialog).toContainText(refund.documentNo)
      await captureBusinessEvidence(dialog, {
        path: info.outputPath('refund-writeoff-automatic-plan.png')
      })
      const written = page.waitForResponse(
        (response) =>
          response.url().endsWith('/rpc/fms_auto_payable_writeoff_secure') &&
          response.request().postDataJSON()?.p_execute === true
      )
      await dialog.getByRole('button', { name: '确认自动核销', exact: true }).click()
      expect((await written).ok()).toBe(true)
      await expect(dialog).not.toBeVisible()
    }
    const current = await client
      .from('fms_payable_writeoff_record')
      .select(
        'id,amount,payment_amount,refund_amount,cash_discount_amount,status,needs_voucher,document_no'
      )
      .eq('refund_line_id', identifier(refundLines[0]))
      .eq('status', 'active')
    expect(current.error).toBeNull()
    expect(current.data).toHaveLength(1)
    const matching = rows(current.data)[0]
    expect(Number(matching.amount)).toBe(amount)
    expect(Number(matching.payment_amount)).toBe(amount)
    expect(Number(matching.refund_amount)).toBe(amount)
    expect(Number(matching.cash_discount_amount)).toBe(0)
    expect(matching.needs_voucher).toBe(false)
    expect(matching.document_no).toBeNull()
    appendFileSync(
      '.artifacts/payable-refund-matching-live-records.jsonl',
      JSON.stringify({
        id: identifier(matching),
        sourceId: source.id,
        refundId: refund.id,
        kind: 'matching',
        provider: 'supabase',
        run
      }) + '\n'
    )
    await page.getByRole('tab', { name: /^核销记录/ }).click()
    const historyRow = page
      .getByRole('tabpanel', { name: /^核销记录/ })
      .locator('tbody tr')
      .filter({ hasText: refund.documentNo })
    await expect(historyRow).toContainText(source.documentNo)
    await expect(historyRow).toContainText('已核销')
    await captureBusinessEvidence(page, {
      path: info.outputPath(`refund-writeoff-history-${index}.png`)
    })
    await historyRow.getByRole('button', { name: '反核销', exact: true }).click()
    const reason = page.getByRole('dialog', { name: '反核销原因', exact: true })
    await reason.getByRole('textbox').fill('独立验收租户核对付款冲退款余额恢复')
    const reversed = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_reverse_payable_writeoff_secure')
    )
    await reason.getByRole('button', { name: '确定', exact: true }).click()
    expect((await reversed).ok()).toBe(true)
    await expect(historyRow).toContainText('已反核销')
    await rpc(client, 'fms_act_payable_settlement_secure', {
      p_ids: [refund.id],
      p_action: 'cancel_payment',
      p_reason: '核销验收完成，冲回退款到账'
    })
    await rpc(client, 'fms_act_payable_settlement_secure', {
      p_ids: [refund.id],
      p_action: 'void',
      p_reason: '核销验收退款结束'
    })
    await rpc(client, 'fms_act_payable_settlement_secure', {
      p_ids: [source.id],
      p_action: 'cancel_payment',
      p_reason: '核销验收完成，冲回原付款资金'
    })
    await rpc(client, 'fms_act_payable_settlement_secure', {
      p_ids: [source.id],
      p_action: 'void',
      p_reason: '核销验收原付款结束'
    })
  }
  expect(errors).toEqual([])
})

test('真实付款冲退款记录的主题窄屏、金额可见与无加载刷新', async ({ page, context }, info) => {
  const client = await assertPayableAcceptanceSession(context)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('dark')
  })
  const artifacts = rows(
    readFileSync('.artifacts/payable-refund-matching-live-records.jsonl', 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
  )
  const run = artifacts.at(-1)?.run
  const references = artifacts
    .filter((row) => row.kind === 'matching' && row.run === run && row.provider === 'supabase')
    .slice(-2)
  expect(references).toHaveLength(2)
  const stored = await client
    .from('fms_payable_writeoff_record')
    .select('id,record_no,amount,status,relation')
    .eq('tenant_id', payableAcceptanceTenantId)
    .in('id', references.map(identifier))
  expect(stored.error).toBeNull()
  expect(stored.data).toHaveLength(2)
  const pending = page.waitForResponse(
    (response) => response.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure'),
    { timeout: 90_000 }
  )
  await page.goto('#/fms/accounts-payable/writeoff', { waitUntil: 'domcontentloaded' })
  expect((await pending).ok()).toBe(true)
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
  const guide = page.getByRole('button', { name: '知道了', exact: true })
  if (await guide.isVisible()) await guide.click()
  const loaded = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure') &&
      response.request().postDataJSON()?.p_query?.relation === 'payment_refund'
  )
  await page.getByRole('radio', { name: '付款冲退款', exact: true }).locator('..').click()
  const relationResponse = await loaded
  expect(relationResponse.ok()).toBe(true)
  const relationData = rows([await relationResponse.json()])[0]
  const manualScheme = rows(relationData.schemes).find((scheme) => scheme.code === 'AP-MANUAL')
  assert.ok(manualScheme && typeof manualScheme.name === 'string')
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
  await expect(
    page.locator('.el-form-item').filter({ has: page.getByText('核销方案', { exact: true }) })
  ).toContainText(manualScheme.name)
  await page.getByRole('tab', { name: /^核销记录/ }).click()
  const panel = page.getByRole('tabpanel', { name: /^核销记录/ })
  for (const record of rows(stored.data)) {
    expect(record.relation).toBe('payment_refund')
    expect(record.status).toBe('reversed')
    assert.equal(typeof record.record_no, 'string')
    const row = panel.locator('tbody tr').filter({ hasText: record.record_no })
    await expect(row).toBeVisible()
    const amount = row
      .getByRole('cell', { name: `¥${Number(record.amount).toFixed(2)}`, exact: true })
      .first()
    await amount.scrollIntoViewIfNeeded()
    await expect(amount).toBeInViewport()
    await expect(row.getByRole('cell', { name: '已反核销', exact: true })).toBeInViewport()
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    )
  ).toBe(true)
  await captureBusinessEvidence(page, {
    path: info.outputPath('refund-writeoff-history-visible.png')
  })
  const refreshed = page.waitForResponse((response) =>
    response.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure')
  )
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.locator('.el-skeleton')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '查询', exact: true })).not.toHaveClass(
    /is-loading/
  )
  expect((await refreshed).ok()).toBe(true)
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
  await expect(panel.locator('.el-loading-mask')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('两笔真实退款列表详情的窄屏主题与专注模式', async ({ page, context }, info) => {
  const client = await assertPayableAcceptanceSession(context)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('dark')
  })
  const response = await client
    .from('fms_payable_settlement_document')
    .select('id,document_no,tenant_id')
    .eq('tenant_id', payableAcceptanceTenantId)
    .eq('kind', 'refund')
    .order('created_at', { ascending: false })
    .limit(2)
  expect(response.error).toBeNull()
  expect(response.data).toHaveLength(2)
  for (const [index, value] of rows(response.data).entries()) {
    const identity = documentIdentity(value)
    const row = await openRecord(page, 'payment-refund', identity.id, identity.documentNo)
    await expect(page.locator('.el-skeleton')).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      )
    ).toBe(true)
    await captureBusinessEvidence(page, { path: info.outputPath(`refund-list-${index + 1}.png`) })
    await row.getByRole('button', { name: '查看', exact: true }).click()
    const detail = page.getByRole('dialog', { name: '查看付款退款单', exact: true })
    await expect(detail.getByText('业务日期', { exact: true })).toBeVisible()
    await expect(detail.locator('.el-skeleton')).toHaveCount(0)
    await captureBusinessEvidence(detail, {
      path: info.outputPath(`refund-detail-top-${index + 1}.png`)
    })
    await detail.getByText('退款金额说明', { exact: true }).scrollIntoViewIfNeeded()
    await captureBusinessEvidence(detail, {
      path: info.outputPath(`refund-detail-bottom-${index + 1}.png`)
    })
    await detail.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await expect(page.getByRole('heading', { name: '付款退款单', exact: true })).not.toBeVisible()
    await expect(row).toBeVisible()
    await captureBusinessEvidence(page, { path: info.outputPath(`refund-focus-${index + 1}.png`) })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: '付款退款单', exact: true })).toBeVisible()
  }
  expect(errors).toEqual([])
})
