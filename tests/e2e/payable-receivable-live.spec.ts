import assert from 'node:assert/strict'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import dayjs from 'dayjs'
import { expect, test, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertPayableAcceptanceSession,
  acceptanceRows as rows,
  acceptanceRecord as record,
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
test.skip(!enabled, '仅显式运行独立验收租户真实应付冲应收测试')
test.setTimeout(180_000)

function textField(value: Record<string, unknown>, key: string): string {
  const content = value[key]
  assert.ok(typeof content === 'string' && content.length > 0, `缺少验收字段 ${key}`)
  return content
}

const journalPath = '.artifacts/payable-receivable-live-records.jsonl'
function writeJournal(value: Record<string, unknown>): void {
  appendFileSync(journalPath, JSON.stringify({ provider: 'supabase', ...value }) + '\n')
}

async function prepareAccounting(client: SupabaseClient, context: Record<string, unknown>) {
  const book = textField(context, 'bookId')
  const subjects = await client
    .from('fms_subject')
    .select('id,subject_code,subject_name')
    .eq('account_set_id', book)
    .eq('subject_code', '1122')
  expect(subjects.error).toBeNull()
  const subject =
    rows(subjects.data)[0] ||
    record(
      await rpc(client, 'save_fms_subject', {
        p_payload: {
          tenantId: payableAcceptanceTenantId,
          accountSetId: book,
          subjectCode: '1122',
          subjectName: '验收应收账款',
          category: 'asset',
          balanceDirection: 'debit',
          isEnabled: true,
          cashFlowRequired: false,
          remark: '独立验收租户应收应付抵销，不用于经营租户'
        }
      })
    )
  const year = dayjs().year()
  const opening = record(
    await rpc(client, 'fms_opening_balance_summary_secure', {
      p_account_set_id: book,
      p_fiscal_year: year
    })
  )
  if (opening.status !== 'confirmed') {
    if (Number(opening.entry_count) === 0)
      await rpc(client, 'save_fms_opening_balance_secure', {
        p_payload: {
          tenantId: payableAcceptanceTenantId,
          accountSetId: book,
          fiscalYear: year,
          subjectId: identifier(subject),
          openingDebit: 0,
          openingCredit: 0,
          auxiliaryValues: {}
        }
      })
    await rpc(client, 'set_fms_opening_balance_status_secure', {
      p_account_set_id: book,
      p_fiscal_year: year,
      p_status: 'confirmed',
      p_reason: '独立验收零期初确认，不涉及经营数据'
    })
  }
  const existing = record(
    await rpc(client, 'fms_list_posting_rules_secure', {
      p_account_set_id: book,
      p_keyword: 'QA_APAR_LIVE'
    })
  )
  if (!rows(existing.records).length)
    await rpc(client, 'save_fms_posting_rule_secure', {
      p_payload: {
        accountSetId: book,
        ruleCode: 'QA_APAR_LIVE',
        ruleName: '独立验收应付冲应收',
        sourceType: 'system',
        eventCode: 'ap_receivable_offset_approved',
        voucherType: 'transfer',
        submissionMode: 'draft',
        priority: 900,
        matchConditions: { writeoff_relation: 'payable_receivable' },
        isEnabled: true,
        lines: [
          {
            lineNo: 10,
            direction: 'debit',
            amountKey: 'payable_amount',
            amountMultiplier: 1,
            subjectId: textField(context, 'debitSubjectId'),
            summary: '应付账款抵销',
            auxiliaryBindings: {}
          },
          {
            lineNo: 20,
            direction: 'credit',
            amountKey: 'receivable_amount',
            amountMultiplier: 1,
            subjectId: identifier(subject),
            summary: '应收账款抵销',
            auxiliaryBindings: {}
          }
        ]
      }
    })
  return identifier(subject)
}

async function prepareSource(
  client: SupabaseClient,
  context: Record<string, unknown>,
  fixture: Record<string, unknown>
) {
  const prior = existsSync(journalPath)
    ? rows(
        readFileSync(journalPath, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      )
    : []
  const key = textField(fixture, 'key')
  const amount = Number(fixture.amount)
  assert.ok(Number.isFinite(amount) && amount > 0)
  let apId = prior.findLast((entry) => entry.key === key && entry.kind === 'ap')?.id
  let arId = prior.findLast((entry) => entry.key === key && entry.kind === 'ar')?.id
  const date = dayjs().format('YYYY-MM-DD')
  if (typeof apId !== 'string') {
    const saved = record(
      await rpc(client, 'fms_save_purchase_payable_secure', {
        p_document: {
          kind: 'financial',
          tenant_id: payableAcceptanceTenantId,
          document_type_id: textField(context, 'apTypeId'),
          supplier_id: textField(fixture, 'supplierId'),
          organization_id: textField(context, 'organizationId'),
          business_date: date,
          remark: key,
          lines: [
            {
              material_id: textField(context, 'materialId'),
              inventory_unit_id: textField(context, 'inventoryUnitId'),
              quantity: 1,
              unit_price: amount,
              tax_rate: 0
            }
          ]
        }
      })
    )
    apId = identifier(saved)
    writeJournal({ key, kind: 'ap', id: apId, documentNo: saved.document_no })
  }
  if (typeof arId !== 'string') {
    const saved = await rpc(client, 'fms_save_receivable_document_secure', {
      p_payload: {
        tenantId: payableAcceptanceTenantId,
        kind: 'financial',
        customerId: textField(fixture, 'customerId'),
        documentTypeId: textField(context, 'arTypeId'),
        settlementOrganizationId: textField(context, 'organizationId'),
        businessDate: date,
        currencyCode: 'CNY',
        remark: key,
        lines: [
          {
            lineNo: 10,
            basis: 'quantity',
            quantity: 1,
            unitPrice: amount,
            taxInclusiveUnitPrice: amount,
            taxRate: 0,
            priceBasis: 'taxed',
            materialId: textField(context, 'materialId'),
            materialDescription: textField(fixture, 'name'),
            inventoryUnitId: textField(context, 'inventoryUnitId'),
            baseUnitId: textField(context, 'baseUnitId'),
            baseQuantity: 1
          }
        ]
      }
    })
    assert.equal(typeof saved, 'string')
    arId = saved
    writeJournal({ key, kind: 'ar', id: arId })
  }
  assert.ok(typeof apId === 'string' && typeof arId === 'string')
  let ap = rows(
    record(
      await rpc(client, 'fms_purchase_payable_list_secure', {
        p_kind: 'financial',
        p_id: apId,
        p_limit: 1
      })
    ).data
  )[0]
  let ar = record(await rpc(client, 'fms_get_receivable_document_secure', { p_id: arId }))
  expect(ap.tenant_id).toBe(payableAcceptanceTenantId)
  expect(ar.tenant_id).toBe(payableAcceptanceTenantId)
  for (const status of ['draft', 'submitted']) {
    if (ap.status === status) {
      await rpc(client, 'fms_act_purchase_payable_secure', {
        p_ids: [apId],
        p_action: status === 'draft' ? 'submit' : 'approve'
      })
      ap = rows(
        record(
          await rpc(client, 'fms_purchase_payable_list_secure', {
            p_kind: 'financial',
            p_id: apId,
            p_limit: 1
          })
        ).data
      )[0]
    }
    if (ar.status === status) {
      await rpc(client, 'fms_act_receivable_document_secure', {
        p_id: arId,
        p_action: status === 'draft' ? 'submit' : 'approve'
      })
      ar = record(await rpc(client, 'fms_get_receivable_document_secure', { p_id: arId }))
    }
  }
  expect(ap.status).toBe('approved')
  expect(ar.status).toBe('approved')
  return { ap, ar, key, amount }
}

async function openOffset(page: Page, name: string) {
  if (!page.url().includes('#/fms/accounts-payable/writeoff'))
    await page.goto('#/fms/accounts-payable/writeoff', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '应付核销工作台', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
  const guide = page.getByRole('button', { name: '知道了', exact: true })
  if (await guide.isVisible()) await guide.click()
  const mode = page.getByRole('radio', { name: '应付冲应收', exact: true })
  if (!(await mode.isChecked())) {
    const switched = page.waitForResponse(
      (response) =>
        response.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure') &&
        response.request().postDataJSON()?.p_query?.relation === 'payable_receivable'
    )
    await mode.locator('..').click()
    expect((await switched).ok()).toBe(true)
  }
  await page.getByRole('tab', { name: '待核销单据', exact: true }).click()
  await page.getByPlaceholder('往来单位或单据编号').fill(name)
  const searched = page.waitForResponse((response) =>
    response.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure')
  )
  await page.getByRole('button', { name: '查询', exact: true }).click()
  expect((await searched).ok()).toBe(true)
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
}

test('真实两笔应付冲应收手工自动、凭证及反核销完整流程', async ({ page, context }, info) => {
  test.setTimeout(480_000)
  const client = await assertPayableAcceptanceSession(context)
  const fixtureContext = record(
    JSON.parse(readFileSync('.artifacts/apar-live-context.json', 'utf8'))
  )
  expect(fixtureContext.tenantId).toBe(payableAcceptanceTenantId)
  const fixtures = rows(fixtureContext.cases)
  expect(fixtures).toHaveLength(2)
  await prepareAccounting(client, fixtureContext)
  const schemes = rows(await rpc(client, 'fms_payable_reference_list_secure', { p_kind: 'scheme' }))
  const automatic = schemes.find(
    (entry) => entry.code === 'AP-AR-AUTO' && entry.enabled && entry.automatic
  )
  assert.ok(automatic)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  for (const [index, fixture] of fixtures.entries()) {
    const source = await prepareSource(client, fixtureContext, fixture)
    const active = await client
      .from('fms_payable_writeoff_record')
      .select('id,voucher_id,amount')
      .eq('payable_id', identifier(source.ap))
      .eq('relation', 'payable_receivable')
      .eq('status', 'active')
    expect(active.error).toBeNull()
    for (const previous of rows(active.data)) {
      if (typeof previous.voucher_id === 'string') {
        const previousVoucher = record(
          await rpc(client, 'fms_get_voucher_secure', {
            p_voucher_id: previous.voucher_id
          })
        )
        expect(['draft', 'voided']).toContain(previousVoucher.status)
        if (previousVoucher.status !== 'voided')
          await rpc(client, 'transition_fms_voucher_secure', {
            p_voucher_id: previous.voucher_id,
            p_action: 'void',
            p_reason: '恢复独立验收流程',
            p_action_date: null
          })
      }
      await rpc(client, 'fms_reverse_payable_writeoff_secure', {
        p_id: identifier(previous),
        p_reason: '恢复独立验收流程，保留审计历史'
      })
    }
    for (const phase of ['partial', 'final']) {
      const amount = phase === 'partial' && index === 0 ? 40 : source.amount
      await openOffset(page, textField(fixture, 'name'))
      const primary = page
        .locator('[aria-label="财务应付单"] tbody tr')
        .filter({ hasText: textField(source.ap, 'document_no') })
      const secondary = page
        .locator('[aria-label="财务应收单"] tbody tr')
        .filter({ hasText: textField(source.ar, 'document_no') })
      await expect(primary).toBeVisible()
      await expect(secondary).toBeVisible()
      let writeoffId: string
      if (index === 0) {
        await primary.getByRole('spinbutton').fill(String(amount))
        await secondary.getByRole('spinbutton').fill(String(amount))
        await primary.locator('.el-checkbox').first().click()
        await secondary.locator('.el-checkbox').first().click()
        await page.getByRole('button', { name: '核销', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: '核销确认', exact: true })
        const written = page.waitForResponse((response) =>
          response.url().endsWith('/rpc/fms_payable_writeoff_secure')
        )
        await dialog.getByRole('button', { name: '执行核销', exact: true }).click()
        const response = await written
        expect(response.ok()).toBe(true)
        const ids: unknown = await response.json()
        assert.ok(Array.isArray(ids) && typeof ids[0] === 'string')
        writeoffId = ids[0]
      } else {
        await page.getByRole('combobox', { name: '核销方案', exact: true }).click()
        await page.getByRole('option', { name: textField(automatic, 'name'), exact: true }).click()
        const planned = page.waitForResponse((response) =>
          response.url().endsWith('/rpc/fms_auto_payable_writeoff_secure')
        )
        await page.getByRole('button', { name: '按方案自动核销', exact: true }).click()
        const preview = await planned
        expect(preview.ok()).toBe(true)
        const plan = record(await preview.json())
        expect(Number(plan.total_amount)).toBe(amount)
        expect(rows(plan.items)).toHaveLength(1)
        const dialog = page.getByRole('dialog', { name: '按方案自动核销', exact: true })
        await captureBusinessEvidence(dialog, { path: info.outputPath(`offset-auto-${phase}.png`) })
        const written = page.waitForResponse(
          (response) =>
            response.url().endsWith('/rpc/fms_auto_payable_writeoff_secure') &&
            response.request().postDataJSON()?.p_execute === true
        )
        await dialog.getByRole('button', { name: '确认自动核销', exact: true }).click()
        const response = await written
        expect(response.ok()).toBe(true)
        const result = record(await response.json())
        assert.ok(Array.isArray(result.record_ids) && typeof result.record_ids[0] === 'string')
        writeoffId = result.record_ids[0]
      }
      writeJournal({ key: source.key, kind: 'writeoff', id: writeoffId, phase, amount })
      const persisted = await client
        .from('fms_payable_writeoff_record')
        .select(
          'id,record_no,document_no,amount,receivable_amount,payment_amount,needs_voucher,status'
        )
        .eq('id', writeoffId)
        .single()
      expect(persisted.error).toBeNull()
      const matching = record(persisted.data)
      expect(Number(matching.amount)).toBe(amount)
      expect(Number(matching.receivable_amount)).toBe(amount)
      expect(Number(matching.payment_amount)).toBe(0)
      expect(matching.needs_voucher).toBe(true)
      await page.getByRole('tab', { name: /^核销记录/ }).click()
      const row = page
        .getByRole('tabpanel', { name: /^核销记录/ })
        .locator('tbody tr')
        .filter({ hasText: textField(matching, 'record_no') })
      await expect(row).toContainText('已核销')
      await row
        .getByRole('button', { name: textField(matching, 'document_no'), exact: true })
        .click()
      const detail = page.getByRole('dialog', { name: '应付核销单', exact: true })
      await expect(detail).toContainText(textField(source.ap, 'document_no'))
      await expect(detail).toContainText(textField(source.ar, 'document_no'))
      await captureBusinessEvidence(detail, {
        path: info.outputPath(`offset-document-${index}-${phase}.png`)
      })
      await detail.getByRole('button', { name: '关闭此对话框', exact: true }).click()
      const previewed = page.waitForResponse(
        (response) =>
          response.url().endsWith('/rpc/fms_payable_settlement_voucher_secure') &&
          response.request().postDataJSON()?.p_preview === true
      )
      await row.getByRole('button', { name: '预览凭证', exact: true }).click()
      expect((await previewed).ok()).toBe(true)
      const previewDialog = page.getByRole('dialog', { name: '凭证预览', exact: true })
      await expect(previewDialog).toContainText('2202')
      await expect(previewDialog).toContainText('1122')
      await captureBusinessEvidence(previewDialog, {
        path: info.outputPath(`offset-voucher-preview-${index}-${phase}.png`)
      })
      await previewDialog.getByRole('button', { name: '关闭此对话框', exact: true }).click()
      const generated = page.waitForResponse(
        (response) =>
          response.url().endsWith('/rpc/fms_payable_settlement_voucher_secure') &&
          response.request().postDataJSON()?.p_preview === false
      )
      const refreshed = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure')
      )
      await row.getByRole('button', { name: '生成凭证', exact: true }).click()
      const generatedResponse = await generated
      expect(generatedResponse.ok()).toBe(true)
      const voucher = record(await generatedResponse.json())
      expect(voucher.status).toBe('generated')
      assert.ok(Array.isArray(voucher.voucher_ids) && typeof voucher.voucher_ids[0] === 'string')
      const voucherId = voucher.voucher_ids[0]
      writeJournal({ key: source.key, kind: 'voucher', id: voucherId, writeoffId, phase })
      const workspace = record(await (await refreshed).json())
      const refreshedRow = rows(workspace.history).find((entry) => entry.id === writeoffId)
      assert.ok(refreshedRow)
      await expect(row.getByRole('button', { name: '生成凭证', exact: true })).toBeEnabled()
      await captureBusinessEvidence(page, {
        path: info.outputPath(`offset-history-${index}-${phase}.png`)
      })
      if (phase === 'partial') {
        await row.getByRole('button', { name: '反核销', exact: true }).click()
        const blockedReason = page.getByRole('dialog', { name: '反核销原因', exact: true })
        await blockedReason.getByRole('textbox').fill('验证已生成有效凭证时禁止反核销')
        const blocked = page.waitForResponse((response) =>
          response.url().endsWith('/rpc/fms_reverse_payable_writeoff_secure')
        )
        await blockedReason.getByRole('button', { name: '确定', exact: true }).click()
        const rejection = await blocked
        expect(rejection.ok()).toBe(false)
        expect(await rejection.json()).toEqual(expect.objectContaining({ code: '23514' }))
        await expect(row).toContainText('已核销')
        await row
          .getByRole('button', { name: textField(refreshedRow, 'voucher_no'), exact: true })
          .click()
        const voucherDetail = page.getByRole('dialog', { name: '会计凭证详情', exact: true })
        await expect(voucherDetail).toContainText('验收应收账款')
        await expect(voucherDetail).toContainText('验收采购应付')
        await captureBusinessEvidence(voucherDetail, {
          path: info.outputPath(`offset-voucher-detail-${index}.png`)
        })
        await voucherDetail.getByRole('button', { name: /关闭此/ }).click()
        const voucherList = page.waitForResponse((response) =>
          response.url().endsWith('/rpc/fms_list_vouchers_secure')
        )
        await page.getByRole('button', { name: '查询', exact: true }).click()
        expect((await voucherList).ok()).toBe(true)
        const voucherRow = page
          .locator('tbody tr')
          .filter({ hasText: textField(refreshedRow, 'voucher_no') })
        await voucherRow.getByRole('button', { name: '更多操作', exact: true }).click()
        await page.getByRole('menuitem', { name: '作废凭证', exact: true }).click()
        const voidDialog = page.getByRole('dialog', { name: '作废会计凭证', exact: true })
        await voidDialog.getByRole('textbox').fill('独立验收先作废凭证，再验证反核销')
        const voided = page.waitForResponse((response) =>
          response.url().endsWith('/rpc/transition_fms_voucher_secure')
        )
        await voidDialog.getByRole('button', { name: '确认作废', exact: true }).click()
        expect((await voided).ok()).toBe(true)
        await expect(voidDialog).not.toBeVisible()
        await openOffset(page, textField(fixture, 'name'))
        await page.getByRole('tab', { name: /^核销记录/ }).click()
        await row.getByRole('button', { name: '反核销', exact: true }).click()
        const reason = page.getByRole('dialog', { name: '反核销原因', exact: true })
        await reason.getByRole('textbox').fill('独立验收恢复双方余额，核对原应收反向流水')
        const reversed = page.waitForResponse((response) =>
          response.url().endsWith('/rpc/fms_reverse_payable_writeoff_secure')
        )
        await reason.getByRole('button', { name: '确定', exact: true }).click()
        expect((await reversed).ok()).toBe(true)
        await expect(row).toContainText('已反核销')
      }
    }
    const apFinal = rows(
      record(
        await rpc(client, 'fms_purchase_payable_list_secure', {
          p_kind: 'financial',
          p_id: identifier(source.ap),
          p_limit: 1
        })
      ).data
    )[0]
    const arFinal = record(
      await rpc(client, 'fms_get_receivable_document_secure', { p_id: identifier(source.ar) })
    )
    expect(Number(apFinal.unpaid_amount)).toBe(0)
    expect(Number(arFinal.outstanding_amount)).toBe(0)
  }
  expect(pageErrors).toEqual([])
})

test('真实应付冲应收关系、权限受限状态与无加载刷新', async ({ page, context }, info) => {
  await assertPayableAcceptanceSession(context)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  const initial = page.waitForResponse((response) =>
    response.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure')
  )
  await page.goto('#/fms/accounts-payable/writeoff', { waitUntil: 'domcontentloaded' })
  expect((await initial).ok()).toBe(true)
  const guide = page.getByRole('button', { name: '知道了', exact: true })
  if (await guide.isVisible()) await guide.click()
  const switched = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure') &&
      response.request().postDataJSON()?.p_query?.relation === 'payable_receivable'
  )
  await page.getByRole('radio', { name: '应付冲应收', exact: true }).locator('..').click()
  const response = await switched
  if (response.ok()) {
    await expect(page.getByRole('region', { name: '财务应收单', exact: true })).toBeVisible()
  } else {
    expect(response.status()).toBe(403)
    const error: unknown = await response.json()
    expect(error).toEqual(expect.objectContaining({ code: '42501' }))
    await expect(page.getByText(/应收.*权限|没有.*权限/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: '核销', exact: true })).toHaveCount(0)
    await expect(page.locator('.payable-writeoff-page tbody tr')).toHaveCount(0)
  }
  await captureBusinessEvidence(page, { path: info.outputPath('receivable-offset-state.png') })
  const refreshed = page.waitForResponse((entry) =>
    entry.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure')
  )
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.locator('.el-skeleton')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '查询', exact: true })).not.toHaveClass(
    /is-loading/
  )
  expect((await refreshed).status()).toBe(response.status())
  await expect(page.getByRole('button', { name: '刷新', exact: true })).toBeEnabled()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    )
  ).toBe(true)
  await captureBusinessEvidence(page, { path: info.outputPath('receivable-offset-refreshed.png') })
  expect(errors).toEqual([])
})

test('真实两笔应付冲应收核销单及金额的多主题视觉验收', async ({ page, context }, info) => {
  const client = await assertPayableAcceptanceSession(context)
  const fixtureContext = record(
    JSON.parse(readFileSync('.artifacts/apar-live-context.json', 'utf8'))
  )
  const entries = rows(
    readFileSync(journalPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
  )
  const targets = rows(fixtureContext.cases).map((fixture) => {
    const target = entries.findLast(
      (entry) => entry.key === fixture.key && entry.kind === 'writeoff' && entry.phase === 'final'
    )
    assert.ok(target)
    return identifier(target)
  })
  expect(targets).toHaveLength(2)
  const stored = await client
    .from('fms_payable_writeoff_record')
    .select('id,record_no,document_no,amount,receivable_amount,payment_amount,status,voucher_id')
    .eq('tenant_id', payableAcceptanceTenantId)
    .in('id', targets)
  expect(stored.error).toBeNull()
  const references = rows(stored.data)
  expect(references).toHaveLength(2)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  await openOffset(page, '应收应付抵销验收')
  await page.getByRole('tab', { name: /^核销单/ }).click()
  const panel = page.getByRole('tabpanel', { name: /^核销单/ })
  for (const [index, reference] of references.entries()) {
    expect(reference.status).toBe('active')
    expect(Number(reference.payment_amount)).toBe(0)
    expect(Number(reference.amount)).toBe(Number(reference.receivable_amount))
    assert.ok(typeof reference.voucher_id === 'string')
    const row = panel.locator('tbody tr').filter({ hasText: textField(reference, 'record_no') })
    await expect(row).toBeVisible()
    const amount = row
      .getByRole('cell', { name: `¥${Number(reference.amount).toFixed(2)}`, exact: true })
      .first()
    await amount.scrollIntoViewIfNeeded()
    await expect(amount).toBeInViewport()
    await expect(row.getByRole('cell', { name: '已核销', exact: true })).toBeInViewport()
    await row
      .getByRole('button', { name: textField(reference, 'document_no'), exact: true })
      .click()
    const detail = page.getByRole('dialog', { name: '应付核销单', exact: true })
    await expect(detail).toContainText('应收抵销金额')
    await expect(detail).toContainText('主数据已确认')
    await expect(detail.getByRole('cell', { name: '币种', exact: true }).first()).toBeInViewport()
    await expect(detail.locator('.el-skeleton')).toHaveCount(0)
    await captureBusinessEvidence(detail, {
      path: info.outputPath(`offset-confirmed-document-${index}.png`)
    })
    await detail.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    await amount.scrollIntoViewIfNeeded()
  }
  await captureBusinessEvidence(page, { path: info.outputPath('offset-confirmed-list.png') })
  const pending = page.waitForResponse((response) =>
    response.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure')
  )
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.locator('.el-skeleton,.el-loading-mask')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '查询', exact: true })).not.toHaveClass(
    /is-loading/
  )
  expect((await pending).ok()).toBe(true)
  await expect(page.getByRole('button', { name: '刷新', exact: true })).toBeEnabled()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    )
  ).toBe(true)
  expect(errors).toEqual([])
})
