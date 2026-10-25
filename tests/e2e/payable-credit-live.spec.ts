import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
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
  actionTimeout: 25_000
})
test.skip(!enabled, '仅显式运行独立验收租户的真实红字应付流程')
test.setTimeout(300_000)

const markers = ['QA-CREDIT-UI-1', 'QA-CREDIT-UI-2']

async function creditDocuments(client: SupabaseClient) {
  const response = await client
    .from('fms_purchase_payable_document')
    .select('id,document_no,status,details')
    .eq('tenant_id', payableAcceptanceTenantId)
    .eq('kind', 'financial')
    .eq('is_credit', true)
  expect(response.error).toBeNull()
  return rows(response.data).filter((entry) => {
    const details = record(entry.details)
    return markers.includes(String(details.invoice_no))
  })
}

async function openCredit(page: Page, id: string, documentNo: string) {
  await page.goto(`#/fms/accounts-payable/purchase-payable?recordId=${id}`, {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByRole('heading', { name: '财务应付单', exact: true })).toBeVisible({
    timeout: 60_000
  })
  const guide = page.getByRole('button', { name: '知道了', exact: true })
  if (await guide.isVisible()) await guide.click()
  const response = page.waitForResponse(
    (entry) =>
      entry.url().endsWith('/rpc/fms_purchase_payable_list_secure') &&
      entry.request().postDataJSON()?.p_id === id
  )
  await page.getByRole('button', { name: '查询', exact: true }).click()
  expect((await response).ok()).toBe(true)
  const row = page.locator('.art-table-query tbody tr').filter({ hasText: documentNo })
  await expect(row).toHaveCount(1)
  return row
}

async function prepareCreditPosting(client: SupabaseClient, bookId: string) {
  const subjectResponse = await client
    .from('fms_subject')
    .select('id,subject_code')
    .eq('account_set_id', bookId)
    .in('subject_code', ['1405', '2221', '2241'])
  expect(subjectResponse.error).toBeNull()
  const subjects = rows(subjectResponse.data)
  const inventory = subjects.find((subject) => subject.subject_code === '1405')
  const tax = subjects.find((subject) => subject.subject_code === '2221')
  const liability = subjects.find((subject) => subject.subject_code === '2241')
  assert.ok(inventory && tax && liability)
  const existing = record(
    await rpc(client, 'fms_list_posting_rules_secure', {
      p_account_set_id: bookId,
      p_keyword: 'QA_AP_FIN'
    })
  )
  expect(rows(existing.records).some((entry) => entry.rule_code === 'QA_AP_FIN')).toBe(true)
}

test('两笔普通账号红字新增、编辑、提交审核、冻结和凭证贯通', async ({ page, context }, info) => {
  const client = await assertPayableAcceptanceSession(context)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const currency = record(
    await rpc(client, 'fms_payable_currency_context_secure', {
      p_kind: 'financial',
      p_currency: 'CNY',
      p_tenant: payableAcceptanceTenantId,
      p_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()),
      p_id: null
    })
  )
  assert.ok(typeof currency.account_set_id === 'string')
  await prepareCreditPosting(client, currency.account_set_id)
  const suppliers = rows(
    await rpc(client, 'fms_payable_options_secure', {
      p_kind: 'supplier',
      p_tenant_id: payableAcceptanceTenantId
    })
  )
  const materials = rows(
    await rpc(client, 'fms_payable_options_secure', {
      p_kind: 'material',
      p_tenant_id: payableAcceptanceTenantId
    })
  )
  const prior = await creditDocuments(client)
  for (const [index, marker] of markers.entries()) {
    const supplier = suppliers.find((entry) => entry.code === `QA-APAR-LIVE-${index + 1}`)
    const material = materials.find((entry) => entry.code === `QA_AP_MAT_${index + 1}`)
    assert.ok(supplier && material)
    const grossAmount = [56.5, 84.75][index]
    let saved = prior.find((entry) => record(entry.details).invoice_no === marker)
    if (!saved) {
      await page.goto('#/fms/accounts-payable/purchase-payable', { waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: '新增', exact: true }).click()
      const drawer = page.getByRole('dialog', { name: '新增财务应付单', exact: true })
      await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled({
        timeout: 60_000
      })
      await drawer.getByRole('radio', { name: '红字冲减', exact: true }).locator('..').click()
      await drawer.getByRole('combobox', { name: /单据类型$/ }).press('Enter')
      await expect(page.getByRole('option', { name: '标准采购应付', exact: true })).toHaveCount(0)
      await page.getByRole('option', { name: '其他应付', exact: true }).click()
      await drawer.getByRole('textbox', { name: /结算供应商$/ }).click()
      const supplierPicker = page.getByRole('dialog', { name: '选择结算供应商', exact: true })
      await supplierPicker
        .locator('tbody tr')
        .filter({ hasText: String(supplier.code) })
        .click()
      await supplierPicker.getByRole('button', { name: '确定', exact: true }).click()
      await drawer.getByRole('textbox', { name: /发票号码$/ }).fill(marker)
      await drawer.getByRole('button', { name: '选择物料', exact: true }).click()
      const materialPicker = page.getByRole('dialog', { name: '数据来源物料编码', exact: true })
      await materialPicker
        .locator('tbody tr')
        .filter({ hasText: String(material.code) })
        .locator('.el-checkbox')
        .click()
      await materialPicker.getByRole('button', { name: '确定', exact: true }).click()
      const gross = drawer.getByRole('spinbutton', { name: '含税单价', exact: true })
      await gross.scrollIntoViewIfNeeded()
      await gross.fill(String(grossAmount))
      await gross.press('Tab')
      await drawer.getByRole('combobox', { name: '税率', exact: true }).press('Enter')
      await page.getByRole('option', { name: /13%$/ }).click()
      await drawer.getByRole('textbox', { name: '备注', exact: true }).first().fill(marker)
      await expect(drawer.getByText('付款计划', { exact: true })).toHaveCount(0)
      await captureBusinessEvidence(drawer, {
        path: info.outputPath(`credit-create-${index + 1}.png`)
      })
      const savedResponse = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_save_purchase_payable_secure')
      )
      await drawer.getByRole('button', { name: '保存', exact: true }).click()
      const response = await savedResponse
      expect(response.ok()).toBe(true)
      saved = record(await response.json())
      appendFileSync(
        '.artifacts/payable-credit-editor-live.jsonl',
        JSON.stringify({
          marker,
          id: identifier(saved),
          documentNo: saved.document_no,
          stage: 'created'
        }) + '\n'
      )
      expect(saved.is_credit).toBe(true)
      expect(Number(saved.total_amount)).toBe(-grossAmount)
      await expect(drawer).not.toBeVisible()
    }
    const id = identifier(saved)
    assert.ok(typeof saved.document_no === 'string')
    const documentNo = saved.document_no
    let row = await openCredit(page, id, documentNo)
    if (saved.status === 'draft') {
      await row.getByRole('button', { name: '编辑', exact: true }).click()
      const editor = page.getByRole('dialog', { name: '编辑财务应付单', exact: true })
      await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeEnabled({
        timeout: 60_000
      })
      const gross = editor.getByRole('spinbutton', { name: '含税单价', exact: true })
      await gross.scrollIntoViewIfNeeded()
      expect(Number(await gross.inputValue())).toBe(grossAmount)
      const amountSwitch = editor.getByRole('switch', { name: '录入金额', exact: true })
      if (!(await amountSwitch.isChecked())) await amountSwitch.locator('..').click()
      const entered = editor.getByRole('spinbutton', { name: '价税合计', exact: true })
      expect(Number(await entered.inputValue())).toBe(grossAmount)
      await editor
        .getByRole('textbox', { name: '备注', exact: true })
        .first()
        .fill(`${marker} · 已核对绝对计价`)
      const editedResponse = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_save_purchase_payable_secure')
      )
      await editor.getByRole('button', { name: '保存', exact: true }).click()
      const response = await editedResponse
      expect(response.ok()).toBe(true)
      const edited = record(await response.json())
      expect(Number(edited.total_amount)).toBe(-grossAmount)
      expect(Number(rows(edited.lines)[0].face_total_amount)).toBe(grossAmount)
      await expect(editor).not.toBeVisible()
      await row.getByRole('checkbox').locator('..').click()
      await page.getByRole('button', { name: '提交', exact: true }).click()
      await expect(row).toContainText('已提交')
      saved.status = 'submitted'
    }
    if (saved.status === 'submitted') {
      if (!(await row.getByRole('checkbox').isChecked()))
        await row.getByRole('checkbox').locator('..').click()
      await page.getByRole('button', { name: '审核', exact: true }).click()
      await expect(row).toContainText('已审核')
      appendFileSync(
        '.artifacts/payable-credit-editor-live.jsonl',
        JSON.stringify({ marker, id, stage: 'approved' }) + '\n'
      )
    }
    if (!(await row.getByRole('checkbox').isChecked()))
      await row.getByRole('checkbox').locator('..').click()
    await expect(page.getByRole('button', { name: '下推', exact: true })).toBeDisabled()
    await row.getByRole('button', { name: '冻结', exact: true }).click()
    const freeze = page.getByRole('dialog', { name: '冻结财务应付 · CNY', exact: true })
    expect(Number(await freeze.getByRole('spinbutton').inputValue())).toBe(grossAmount)
    await freeze.getByRole('textbox').fill('独立验收红字冻结使用正的控制金额')
    await freeze.getByRole('button', { name: '保存冻结状态', exact: true }).click()
    await expect(row.getByRole('button', { name: '解冻', exact: true })).toBeEnabled()
    await row.getByRole('button', { name: '解冻', exact: true }).click()
    const unfreeze = page.getByRole('dialog', { name: '解冻财务应付 · CNY', exact: true })
    await unfreeze.getByRole('textbox').fill('独立验收恢复红字核销能力')
    await unfreeze.getByRole('button', { name: '保存冻结状态', exact: true }).click()
    await expect(row.getByRole('button', { name: '冻结', exact: true })).toBeEnabled()
    await row.getByRole('button', { name: '查看', exact: true }).click()
    const detail = page.getByRole('dialog', { name: '财务应付单详情', exact: true })
    await expect(detail).toContainText('红字冲减')
    await expect(detail.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
    await captureBusinessEvidence(detail, {
      path: info.outputPath(`credit-approved-detail-${index + 1}.png`)
    })
    await page.keyboard.press('Escape')
    if (!(await row.getByRole('checkbox').isChecked()))
      await row.getByRole('checkbox').locator('..').click()
    const previewResponse = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_preview_payable_voucher_secure')
    )
    await page.getByRole('button', { name: '生成凭证', exact: true }).click()
    await page.getByRole('menuitem', { name: '预览凭证', exact: true }).click()
    const previewResult = await previewResponse
    expect(previewResult.ok()).toBe(true)
    const previewLines = rows(record(await previewResult.json()).lines)
    const preview = page.getByRole('dialog', { name: '凭证预览', exact: true })
    await expect(preview).toContainText('验收其他应付')
    await captureBusinessEvidence(preview, {
      path: info.outputPath(`credit-voucher-preview-${index + 1}.png`)
    })
    await page.keyboard.press('Escape')
    const generatedResponse = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_payable_voucher_secure')
    )
    await page.getByRole('button', { name: '生成凭证', exact: true }).click()
    await page.getByRole('menuitem', { name: '生成凭证', exact: true }).click()
    const generated = record(await (await generatedResponse).json())
    expect(generated.status).toBe('generated')
    assert.ok(typeof generated.voucher_id === 'string')
    const voucher = record(
      await rpc(client, 'fms_get_voucher_secure', { p_voucher_id: generated.voucher_id })
    )
    const lines = rows(voucher.lines)
    expect(
      lines.some(
        (entry) =>
          record(entry.subject).subject_code === '2241' &&
          Number(entry.debit_amount) === grossAmount
      )
    ).toBe(true)
    expect(
      lines.some(
        (entry) =>
          record(entry.subject).subject_code === '1405' &&
          Number(entry.credit_amount) === [50, 75][index]
      )
    ).toBe(true)
    expect(
      lines
        .map((entry) => ({
          code: record(entry.subject).subject_code,
          debit: Number(entry.debit_amount),
          credit: Number(entry.credit_amount)
        }))
        .sort((left, right) => String(left.code).localeCompare(String(right.code)))
    ).toEqual(
      previewLines
        .map((entry) => ({
          code: entry.subject_code,
          debit: Number(entry.debit_amount),
          credit: Number(entry.credit_amount)
        }))
        .sort((left, right) => String(left.code).localeCompare(String(right.code)))
    )
    appendFileSync(
      '.artifacts/payable-credit-editor-live.jsonl',
      JSON.stringify({ marker, id, voucherId: generated.voucher_id, stage: 'voucher' }) + '\n'
    )
    row = await openCredit(page, id, documentNo)
    await expect(row).toContainText('已审核')
  }
  expect(errors).toEqual([])
})

test('红字暂存方向切换、绝对计价编辑与引用检查删除', async ({ page, context }, info) => {
  const client = await assertPayableAcceptanceSession(context)
  const types = rows(
    await rpc(client, 'fms_payable_options_secure', {
      p_kind: 'financial_type',
      p_tenant_id: payableAcceptanceTenantId
    })
  )
  const suppliers = rows(
    await rpc(client, 'fms_payable_options_secure', {
      p_kind: 'supplier',
      p_tenant_id: payableAcceptanceTenantId
    })
  )
  const materials = rows(
    await rpc(client, 'fms_payable_options_secure', {
      p_kind: 'material',
      p_tenant_id: payableAcceptanceTenantId
    })
  )
  const type = types.find((entry) => entry.code === 'AP_FIN_OTHER')
  const supplier = suppliers.find((entry) => entry.code === 'QA-APAR-LIVE-1')
  const material = materials.find((entry) => entry.code === 'QA_AP_MAT_1')
  assert.ok(type && supplier && material)
  const priorDrafts = await client
    .from('fms_purchase_payable_document')
    .select('id,document_no,status')
    .eq('tenant_id', payableAcceptanceTenantId)
    .eq('kind', 'financial')
    .eq('status', 'draft')
    .contains('details', { invoice_no: 'QA-CREDIT-DELETE' })
  expect(priorDrafts.error).toBeNull()
  expect(rows(priorDrafts.data).length).toBeLessThanOrEqual(1)
  const draft =
    rows(priorDrafts.data)[0] ||
    record(
      await rpc(client, 'fms_save_purchase_payable_secure', {
        p_document: {
          kind: 'financial',
          tenant_id: payableAcceptanceTenantId,
          document_type_id: identifier(type),
          supplier_id: identifier(supplier),
          business_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(
            new Date()
          ),
          is_credit: true,
          input_tax_inclusive_price: false,
          invoice_no: 'QA-CREDIT-DELETE',
          lines: [
            {
              material_id: identifier(material),
              inventory_unit_id: material.inventory_unit_id,
              quantity: 1,
              unit_price: 10,
              tax_rate: 13
            }
          ]
        }
      })
    )
  assert.ok(typeof draft.document_no === 'string')
  const row = await openCredit(page, identifier(draft), draft.document_no)
  await row.getByRole('button', { name: '编辑', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '编辑财务应付单', exact: true })
  await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeEnabled({
    timeout: 60_000
  })
  await editor.getByRole('radio', { name: '蓝字应付', exact: true }).locator('..').click()
  await expect(editor.getByText('付款计划', { exact: true })).toBeVisible()
  await editor.getByRole('radio', { name: '红字冲减', exact: true }).locator('..').click()
  await expect(editor.getByText('付款计划', { exact: true })).toHaveCount(0)
  const taxRate = editor
    .locator('.el-select')
    .filter({ has: page.getByRole('combobox', { name: '税率', exact: true }) })
  await taxRate.scrollIntoViewIfNeeded()
  await expect(taxRate).toContainText('13%')
  expect(
    Number(await editor.getByRole('spinbutton', { name: '单价', exact: true }).inputValue())
  ).toBe(10)
  await captureBusinessEvidence(editor, {
    path: info.outputPath('credit-draft-direction-price.png')
  })
  const saved = page.waitForResponse((response) =>
    response.url().endsWith('/rpc/fms_save_purchase_payable_secure')
  )
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  expect(Number(record(await (await saved).json()).total_amount)).toBe(-11.3)
  await expect(editor).not.toBeVisible()
  await row.getByRole('checkbox').locator('..').click()
  const checked = page.waitForResponse((response) =>
    response.url().endsWith('/rpc/fms_payable_delete_dependencies_secure')
  )
  await page.getByRole('button', { name: '删除', exact: true }).click()
  expect((await checked).ok()).toBe(true)
  const confirmation = page.getByRole('dialog', { name: '删除确认', exact: true })
  await expect(confirmation).toBeVisible()
  const removed = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/fms_act_purchase_payable_secure') &&
      response.request().postDataJSON()?.p_action === 'delete'
  )
  await confirmation.getByRole('button', { name: '删除', exact: true }).click()
  expect((await removed).ok()).toBe(true)
  await expect(row).toHaveCount(0)
  expect(await creditDocuments(client)).toHaveLength(2)
})

test('两笔真实红字应付有数据详情与图标刷新视觉验收', async ({ page, context }, info) => {
  const client = await assertPayableAcceptanceSession(context)
  const documents = await creditDocuments(client)
  expect(documents).toHaveLength(2)
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const [index, document] of documents.entries()) {
    assert.ok(typeof document.document_no === 'string')
    const row = await openCredit(page, identifier(document), document.document_no)
    await expect(row).toContainText('红字冲减')
    await row.getByRole('button', { name: '查看', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: '财务应付单详情', exact: true })
    await expect(drawer.getByText('付款计划', { exact: true })).toHaveCount(0)
    await captureBusinessEvidence(drawer, {
      path: info.outputPath(`credit-initial-${index + 1}.png`)
    })
    await drawer.getByText('关联信息', { exact: true }).scrollIntoViewIfNeeded()
    await captureBusinessEvidence(drawer, {
      path: info.outputPath(`credit-lower-${index + 1}.png`)
    })
    await page.keyboard.press('Escape')
    await row.getByRole('cell').nth(2).scrollIntoViewIfNeeded()
    const guide = page.getByRole('button', { name: '知道了', exact: true })
    if (await guide.isVisible()) await guide.click()
    await expect(page.getByRole('heading', { name: '财务应付单', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await captureBusinessEvidence(page, {
      path: info.outputPath(`credit-list-${index + 1}.png`),
      fullPage: true
    })
    const toolbar = page.getByRole('switch', { name: '显示表格右侧工具栏', exact: true })
    if (!(await toolbar.isChecked())) await toolbar.locator('..').click()
    let releaseResponse = () => {}
    const gate = new Promise<void>((resolve) => {
      releaseResponse = resolve
    })
    await page.route(
      '**/rest/v1/rpc/fms_purchase_payable_list_secure',
      async (route) => {
        const response = await route.fetch()
        await gate
        await route.fulfill({ response })
      },
      { times: 1 }
    )
    const refresh = page.getByRole('button', { name: '刷新表格', exact: true })
    const refreshed = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_purchase_payable_list_secure')
    )
    try {
      await refresh.click()
      await expect(refresh).toHaveAttribute('aria-busy', 'true')
      await expect(page.locator('.el-loading-mask:visible, .el-skeleton:visible')).toHaveCount(0)
      await expect(row).toBeVisible()
      await captureBusinessEvidence(page, {
        path: info.outputPath(`credit-icon-refresh-${index + 1}.png`),
        fullPage: true
      })
    } finally {
      releaseResponse()
    }
    expect((await refreshed).ok()).toBe(true)
    await expect(refresh).not.toHaveAttribute('aria-busy', 'true')
    const focus = page.getByRole('switch', { name: '进入专注模式', exact: true })
    await focus.locator('..').click()
    await expect(page.getByRole('heading', { name: '财务应付单', exact: true })).not.toBeVisible()
    await expect(row).toBeVisible()
    await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
    await expect(page.getByRole('heading', { name: '财务应付单', exact: true })).toBeVisible()
    await focus.locator('..').click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: '财务应付单', exact: true })).toBeVisible()
  }
  expect(errors).toEqual([])
})
