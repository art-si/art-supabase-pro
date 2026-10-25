import { expect, test as base } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { appendFileSync, writeFileSync } from 'node:fs'
import {
  assertPayableAcceptanceSession,
  payableAcceptanceTenantId
} from './support/payable-live-session'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { prepareAppearance } from './support/appearance'
import {
  readPayableTypeConfigurations,
  payableTypeConfigurationPath
} from './support/payable-live-data'

const enabled = process.env.E2E_PAYABLE_LIVE === 'true'
const test = base.extend<{ acceptance: SupabaseClient }>({
  acceptance: async ({ context }, use) => {
    await use(await assertPayableAcceptanceSession(context))
  }
})

test('变更两条类型映射不重写已审核暂估的原目标', async ({ page, acceptance }, info) => {
  test.skip(process.env.E2E_PAYABLE_TYPE_REMAP !== 'true', '先完成两张已配置类型的暂估审核')
  const configurations = readPayableTypeConfigurations()
  const updated = configurations.map((item) => ({ ...item }))
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  await page.goto('#/mdm/governance/document-type', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '单据类型', exact: true })).toBeVisible({
    timeout: 60_000
  })
  for (const [index, configuration] of configurations.entries()) {
    const original = await acceptance
      .from('fms_purchase_payable_document')
      .select('id,status,financial_payable_type_id')
      .eq('tenant_id', payableAcceptanceTenantId)
      .eq('document_type_id', configuration.id)
      .eq('kind', 'estimated')
      .eq('is_reversal', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(original.error).toBeNull()
    expect(original.data?.status).toBe('approved')
    expect(original.data?.financial_payable_type_id).toBe(configuration.targetId)
    if (!original.data) throw new Error('缺少已审核的验收暂估')
    const target = await acceptance
      .from('mdm_document_type')
      .select('id,document_type_name,document_type_code')
      .eq('tenant_id', payableAcceptanceTenantId)
      .eq('id', configurations[1 - index].targetId)
      .single()
    expect(target.error).toBeNull()
    if (!target.data) throw new Error('目标类型缺失')
    await page.getByRole('textbox', { name: '关键字', exact: true }).fill(configuration.code)
    await page.getByRole('button', { name: '查询', exact: true }).click()
    const row = page
      .locator('.art-table-query tbody tr')
      .filter({ has: page.getByText(configuration.code, { exact: true }) })
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '编辑单据类型', exact: true })
    await expect(editor.getByRole('combobox', { name: /下推财务应付类型$/ })).toBeEnabled()
    await editor.getByRole('combobox', { name: /下推财务应付类型$/ }).press('Enter')
    await page
      .getByRole('option', {
        name: `${target.data.document_type_name} · ${target.data.document_type_code}`,
        exact: true
      })
      .click()
    await expect(editor.getByRole('button', { name: '保存更改', exact: true })).toBeEnabled()
    await captureBusinessEvidence(editor, { path: info.outputPath(`type-remap-${index + 1}.png`) })
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        new URL(response.url()).pathname.endsWith('/rest/v1/mdm_document_type')
    )
    await editor.getByRole('button', { name: '保存更改', exact: true }).click()
    expect((await saved).ok()).toBe(true)
    await expect(editor).not.toBeVisible()
    const retained = await acceptance
      .from('fms_purchase_payable_document')
      .select('financial_payable_type_id')
      .eq('id', original.data.id)
      .eq('tenant_id', payableAcceptanceTenantId)
      .single()
    expect(retained.error).toBeNull()
    expect(retained.data?.financial_payable_type_id).toBe(configuration.targetId)
    updated[index].targetId = target.data.id
    updated[index].targetName = target.data.document_type_name
  }
  writeFileSync(payableTypeConfigurationPath, JSON.stringify(updated))
})
test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-mdm.storage.json'
    : { cookies: [], origins: [] },
  trace: 'off',
  actionTimeout: 20_000
})
test.skip(!enabled, '仅显式运行独立验收租户真实资料测试')
test.setTimeout(240_000)

test('两条真实暂估类型配置的新增、编辑、查看、复制及无引用删除', async ({
  page,
  acceptance
}, info) => {
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    const request = response.request()
    if (
      new URL(response.url()).pathname.endsWith('/rest/v1/mdm_document_type') &&
      request.method() !== 'GET'
    ) {
      appendFileSync(
        '.artifacts/payable-type-write-metadata.jsonl',
        JSON.stringify({ method: request.method(), status: response.status() }) + '\n'
      )
    }
  })
  await page.goto('#/mdm/governance/document-type', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '单据类型', exact: true })).toBeVisible({
    timeout: 60_000
  })
  await page.getByRole('textbox', { name: '搜索菜单功能', exact: true }).fill('暂估应付单')
  await page
    .locator('.business-menu-filter__tree-area')
    .getByText('暂估应付单', { exact: true })
    .click()
  const run = Date.now().toString(36).toUpperCase()
  const records: Array<{
    id: string
    name: string
    code: string
    targetId: string
    targetName: string
  }> = []
  const rows = page.locator('.art-table-query .el-table__body-wrapper tbody tr')
  for (const [index, targetCode] of ['AP_FIN_EXPENSE', 'AP_FIN_SERVICE'].entries()) {
    const target = await acceptance
      .from('mdm_document_type')
      .select('id,document_type_name')
      .eq('tenant_id', payableAcceptanceTenantId)
      .eq('document_type_code', targetCode)
      .single()
    expect(target.error).toBeNull()
    if (!target.data) throw new Error('验收目标类型缺失')
    const code = `QA_AP_TYPE_${run}_${index + 1}`
    const name = `验收非标暂估${index + 1}-${run}`
    await page.getByRole('button', { name: '新增单据类型', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '新增单据类型', exact: true })
    await expect(dialog.getByRole('textbox', { name: /单据类型编号$/ })).toBeEnabled({
      timeout: 60_000
    })
    await dialog.getByRole('textbox', { name: /单据类型编号$/ }).fill(code)
    await dialog.getByRole('textbox', { name: /单据类型名称$/ }).fill(name)
    await expect(dialog.getByRole('combobox', { name: /下推财务应付类型$/ })).toBeEnabled()
    await dialog.getByRole('combobox', { name: /下推财务应付类型$/ }).press('Enter')
    await page
      .getByRole('option', {
        name: `${target.data.document_type_name} · ${targetCode}`,
        exact: true
      })
      .click()
    await captureBusinessEvidence(dialog, {
      path: info.outputPath(`payable-type-create-${index + 1}.png`)
    })
    const created = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/rest/v1/mdm_document_type')
    )
    await dialog.getByRole('button', { name: '创建单据类型', exact: true }).click()
    expect((await created).ok()).toBe(true)
    await expect(dialog).not.toBeVisible()
    const saved = await acceptance
      .from('mdm_document_type')
      .select('id,financial_payable_type_id,payable_standard_purchase')
      .eq('tenant_id', payableAcceptanceTenantId)
      .eq('document_type_code', code)
      .single()
    expect(saved.error).toBeNull()
    expect(saved.data?.payable_standard_purchase).toBe(false)
    expect(saved.data?.financial_payable_type_id).toBe(target.data.id)
    if (!saved.data) throw new Error('真实单据类型未创建')
    records.push({
      id: saved.data.id,
      name,
      code,
      targetId: target.data.id,
      targetName: target.data.document_type_name
    })
    appendFileSync(
      '.artifacts/payable-live-records.jsonl',
      JSON.stringify({ kind: 'document_type', id: saved.data.id, documentNo: code }) + '\n'
    )
    const row = rows.filter({ has: page.getByText(code, { exact: true }) })
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '编辑单据类型', exact: true })
    const selector = editor
      .locator('.el-select')
      .filter({ has: page.getByRole('combobox', { name: /下推财务应付类型$/ }) })
    await expect(selector).toContainText(target.data.document_type_name)
    await expect(selector).not.toContainText(target.data.id)
    await editor
      .getByRole('textbox', { name: '备注', exact: true })
      .fill(`真实类型映射验收${index + 1}`)
    const edited = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        new URL(response.url()).pathname.endsWith('/rest/v1/mdm_document_type')
    )
    await editor.getByRole('button', { name: '保存更改', exact: true }).click()
    expect((await edited).ok()).toBe(true)
    await expect(editor).not.toBeVisible()
    await row.getByRole('button', { name: '查看', exact: true }).click()
    const detail = page.getByRole('dialog', { name: '查看单据类型', exact: true })
    await expect(detail).toContainText(target.data.document_type_name)
    await expect(detail).toContainText('应付业务规则')
    await captureBusinessEvidence(detail, {
      path: info.outputPath(`payable-type-detail-${index + 1}.png`)
    })
    await detail.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    await row.locator('.el-checkbox').click()
    await page.getByRole('button', { name: '复制', exact: true }).click()
    const copy = page.getByRole('dialog', { name: '复制单据类型', exact: true })
    await copy.getByRole('textbox', { name: /单据类型编号$/ }).fill(`${code}_COPY`)
    const copied = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/copy_mdm_document_type_with_menus')
    )
    await copy.getByRole('button', { name: '创建副本', exact: true }).click()
    expect((await copied).ok()).toBe(true)
    await expect(copy).not.toBeVisible()
    const clone = await acceptance
      .from('mdm_document_type')
      .select('id,financial_payable_type_id')
      .eq('tenant_id', payableAcceptanceTenantId)
      .eq('document_type_code', `${code}_COPY`)
      .single()
    expect(clone.error).toBeNull()
    expect(clone.data?.financial_payable_type_id).toBe(target.data.id)
    const copiedRow = rows.filter({ hasText: `${code}_COPY` })
    if (await row.getByRole('checkbox').isChecked()) await row.locator('.el-checkbox').click()
    if (index === 0) {
      const more = copiedRow.getByRole('button', { name: '更多操作', exact: true })
      await more.focus()
      await more.press('ArrowDown')
      await page.getByRole('menuitem', { name: '删除', exact: true }).click()
    } else {
      await copiedRow.locator('.el-checkbox').click()
      await page.getByRole('button', { name: '批量删除', exact: true }).click()
    }
    const confirmation = page.getByRole('dialog', { name: '删除确认', exact: true })
    await expect(confirmation).toContainText(`${code}_COPY`)
    const deleted = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        new URL(response.url()).pathname.endsWith('/rest/v1/mdm_document_type')
    )
    await confirmation.getByRole('button', { name: '删除', exact: true }).click()
    expect((await deleted).ok()).toBe(true)
    await expect(copiedRow).toHaveCount(0)
    if (await row.getByRole('checkbox').isChecked()) await row.locator('.el-checkbox').click()
  }
  writeFileSync('.artifacts/payable-live-type-config.json', JSON.stringify(records))
  await captureBusinessEvidence(page, { path: info.outputPath('payable-types-list.png') })
  expect(errors).toEqual([])
})

test('两条已配置应付类型的只读视觉走查', async ({ page }, info) => {
  const dark = info.project.name.includes('dark')
  await prepareAppearance(page, { theme: dark ? 'dark' : 'light', boxBorderMode: !dark })
  await page.goto('#/mdm/governance/document-type', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '单据类型', exact: true })).toBeVisible({
    timeout: 60_000
  })
  for (const [index, configuration] of readPayableTypeConfigurations().entries()) {
    await page.getByRole('textbox', { name: '关键字', exact: true }).fill(configuration.code)
    await page.getByRole('button', { name: '查询', exact: true }).click()
    const row = page
      .locator('.art-table-query tbody tr')
      .filter({ has: page.getByText(configuration.code, { exact: true }) })
    await row.getByRole('button', { name: '查看', exact: true }).click()
    const detail = page.getByRole('dialog', { name: '查看单据类型', exact: true })
    await expect(detail).toContainText(configuration.targetName)
    await expect(detail.getByText('需要排包', { exact: true })).toHaveCount(0)
    await captureBusinessEvidence(detail, { path: info.outputPath(`type-detail-${index + 1}.png`) })
    await detail.getByText('更新时间', { exact: true }).scrollIntoViewIfNeeded()
    await captureBusinessEvidence(detail, { path: info.outputPath(`type-audit-${index + 1}.png`) })
    await detail.getByRole('button', { name: '关闭此对话框', exact: true }).click()
  }
})
