import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { expect, test, type Locator } from '@playwright/test'
import {
  acceptanceRecord,
  acceptanceRows,
  acceptanceRpc,
  assertPayableAcceptanceSession,
  payableAcceptanceTenantId
} from './support/payable-live-session'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { prepareAppearance } from './support/appearance'
import { financePaths } from '../../src/router/business-paths'

const enabled = process.env.E2E_PAYABLE_LIVE === 'true'
test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-real.storage.json'
    : { cookies: [], origins: [] },
  actionTimeout: 30_000
})
test.setTimeout(360_000)

async function setSwitch(editor: Locator, name: string, value: boolean): Promise<void> {
  const control = editor.getByRole('switch', { name, exact: true })
  if ((await control.getAttribute('aria-checked')) !== String(value))
    await control.locator('..').click()
  await expect(control).toHaveAttribute('aria-checked', String(value))
}

test('普通账号两条真实参数创建、编辑、删除重建与只读复核', async ({ page, context }, info) => {
  test.skip(!enabled || process.env.E2E_PAYABLE_ACCRUAL_LIVE !== 'true', '仅在独立验收租户明确执行')
  const client = await assertPayableAcceptanceSession(context)
  const metadata = acceptanceRecord(
    JSON.parse(readFileSync('.artifacts/payable-accrual-live-context.json', 'utf8'))
  )
  const organizationNames = metadata.organizationNames
  assert.ok(Array.isArray(organizationNames) && organizationNames.length === 2)
  const bookLabel = metadata.bookLabel
  assert.ok(typeof bookLabel === 'string')
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  await page.goto(`#${financePaths.estimatedPayable}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '自动暂估', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '自动暂估参数', exact: true })
  await expect(settings).toBeVisible()
  const persist = async (index: number, existing: boolean) => {
    const code = `QA_AUTO_UI_${index}`
    if (existing) {
      const row = settings.locator('.el-table__body-wrapper tbody tr').filter({ hasText: code })
      await row.getByRole('button', { name: '编辑自动暂估参数', exact: true }).click()
    } else await settings.getByRole('button', { name: '新增参数', exact: true }).click()
    const editor = page.getByRole('dialog', {
      name: existing ? '编辑自动暂估参数' : '新增自动暂估参数',
      exact: true
    })
    await editor.getByRole('textbox', { name: /参数编码$/ }).fill(code)
    await editor.getByRole('textbox', { name: /参数名称$/ }).fill(`验收自动暂估参数${index}·已核对`)
    if (!existing) {
      await editor.getByRole('combobox', { name: /库存组织$/ }).click()
      await page
        .getByRole('option', { name: String(organizationNames[index - 1]), exact: true })
        .click()
      await editor.getByRole('combobox', { name: /核算账套（人民币本位币）$/ }).click()
      await page.getByRole('option', { name: bookLabel, exact: true }).click()
    }
    await setSwitch(editor, '入库审核自动生成', false)
    await setSwitch(editor, '按授权自动审核暂估', index === 2)
    await captureBusinessEvidence(editor, {
      path: info.outputPath(`accrual-real-editor-${index}-${existing ? 'edit' : 'create'}.png`)
    })
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith('/rpc/fms_save_payable_accrual_policy_secure') &&
        response.request().postDataJSON()?.p_policy?.code === code
    )
    await editor.getByRole('button', { name: '保存参数', exact: true }).click()
    const response = await saved
    expect(response.ok()).toBe(true)
    await response.finished()
    await expect(editor).toBeHidden()
    await expect(
      settings.locator('.el-table__body-wrapper tbody tr').filter({ hasText: code })
    ).toContainText(`验收自动暂估参数${index}·已核对`)
  }
  let workspace = acceptanceRecord(
    await acceptanceRpc(client, 'fms_payable_accrual_workspace_secure', {
      p_query: { keyword: 'QA_AUTO_UI_' }
    })
  )
  const initial = acceptanceRows(acceptanceRecord(workspace.configurations).data)
  for (const index of [1, 2])
    await persist(
      index,
      initial.some((row) => row.code === `QA_AUTO_UI_${index}`)
    )
  await persist(1, true)
  workspace = acceptanceRecord(
    await acceptanceRpc(client, 'fms_payable_accrual_workspace_secure', {
      p_query: { keyword: 'QA_AUTO_UI_' }
    })
  )
  const current = acceptanceRows(acceptanceRecord(workspace.configurations).data)
  expect(current).toHaveLength(2)
  const second = current.find((row) => row.code === 'QA_AUTO_UI_2')
  assert.ok(second && typeof second.id === 'string')
  const secondRow = settings
    .locator('.el-table__body-wrapper tbody tr')
    .filter({ hasText: 'QA_AUTO_UI_2' })
  if (Number(second.generated_count) > 0 || second.locked) {
    await secondRow.getByRole('button', { name: '删除自动暂估参数', exact: true }).click()
    const guard = page.getByRole('dialog', { name: '暂时无法删除自动暂估参数', exact: true })
    await expect(guard).toBeVisible()
    await expect(guard).toContainText('生成历史')
    await guard.getByRole('button', { name: '关闭', exact: true }).click()
    await expect(secondRow).toBeVisible()
  } else {
    const removed = page.waitForResponse(
      (response) =>
        response.url().endsWith('/rpc/fms_delete_payable_accrual_policy_secure') &&
        response.request().postDataJSON()?.p_id === second.id
    )
    await secondRow.getByRole('button', { name: '删除自动暂估参数', exact: true }).click()
    await page.locator('.el-message-box').getByRole('button', { name: '删除', exact: true }).click()
    const response = await removed
    expect(response.ok()).toBe(true)
    await response.finished()
    await expect(secondRow).toHaveCount(0)
    await persist(2, false)
  }
  workspace = acceptanceRecord(
    await acceptanceRpc(client, 'fms_payable_accrual_workspace_secure', {
      p_query: { keyword: 'QA_AUTO_UI_' }
    })
  )
  const rows = acceptanceRows(acceptanceRecord(workspace.configurations).data)
  expect(rows).toHaveLength(2)
  for (const row of rows) {
    expect(row.tenant_id).toBe(payableAcceptanceTenantId)
    expect(row.enabled).toBe(false)
    expect(row.auto_approve).toBe(row.code === 'QA_AUTO_UI_2')
    const original = current.find((existing) => existing.code === row.code)
    expect(row.generated_count).toBe(original?.generated_count)
  }
  await expect(settings.locator('[aria-busy="true"]:visible')).toHaveCount(0)
  await captureBusinessEvidence(settings, {
    path: info.outputPath('accrual-real-two-configurations.png')
  })
  const loaded = page.waitForResponse((result) =>
    result.url().endsWith('/rpc/fms_payable_accrual_workspace_secure')
  )
  await settings.getByRole('button', { name: '刷新自动暂估', exact: true }).click()
  const refreshed = await loaded
  expect(refreshed.ok()).toBe(true)
  await refreshed.finished()
  await expect(
    settings.locator('.el-table__body-wrapper tbody tr').filter({ hasText: 'QA_AUTO_UI_' })
  ).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await settings.getByRole('button', { name: /关闭此/ }).click()
})

test('两条原生入库自动暂估在财务页只读核对来源与明细', async ({ page, context }, info) => {
  test.skip(
    !enabled || process.env.E2E_PAYABLE_ACCRUAL_READONLY !== 'true',
    '仅复核已完成的独立库存验收'
  )
  const client = await assertPayableAcceptanceSession(context)
  const errors: string[] = []
  const writes: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    const endpoint = new URL(request.url()).pathname.split('/').pop() || ''
    if (
      request.method() === 'POST' &&
      /^(fms_save_|fms_act_|fms_execute_|wms_save_|wms_change_)/.test(endpoint)
    )
      writes.push(endpoint)
  })
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  const sources = await client
    .from('wms_purchase_document')
    .select('id,document_no,remark,status')
    .eq('tenant_id', payableAcceptanceTenantId)
    .in('remark', ['QA_AUTO_STOCK_1', 'QA_AUTO_STOCK_2'])
    .order('remark')
  expect(sources.error).toBeNull()
  const rows = acceptanceRows(sources.data)
  expect(rows).toHaveLength(2)
  for (const [position, source] of rows.entries()) {
    expect(source.status).toBe('approved')
    assert.ok(typeof source.document_no === 'string')
    const documents = acceptanceRows(
      acceptanceRecord(
        await acceptanceRpc(client, 'fms_purchase_payable_list_secure', {
          p_kind: 'estimated',
          p_keyword: source.document_no
        })
      ).data
    )
    expect(documents).toHaveLength(1)
    const payableDocument = documents[0]
    assert.ok(
      typeof payableDocument.id === 'string' && typeof payableDocument.document_no === 'string'
    )
    expect(payableDocument.source_document_id).toBe(source.id)
    expect(payableDocument.status).toBe('approved')
    expect(payableDocument.total_amount).toBe(113 * (position + 1))
    expect(acceptanceRecord(payableDocument.automatic_accrual).policy_code_snapshot).toBe(
      `QA_AUTO_UI_${position + 1}`
    )
    const ready = page.waitForResponse(
      (response) =>
        response.url().endsWith('/rpc/fms_purchase_payable_list_secure') &&
        response.request().postDataJSON()?.p_id === payableDocument.id
    )
    await page.goto(`#${financePaths.estimatedPayable}?recordId=${payableDocument.id}`, {
      waitUntil: 'domcontentloaded'
    })
    expect((await ready).ok()).toBe(true)
    const drawer = page.getByRole('dialog', { name: '暂估应付单详情', exact: true })
    await expect(drawer).toBeVisible()
    await expect(
      drawer.locator('[aria-busy="true"]:visible,.el-loading-mask:visible,.el-skeleton:visible')
    ).toHaveCount(0)
    await expect(drawer.locator('.el-alert--error:visible')).toHaveCount(0)
    await expect(drawer).toContainText(payableDocument.document_no)
    await expect(drawer).toContainText(source.document_no)
    await expect(drawer).toContainText(`QA_AUTO_UI_${position + 1}`)
    await expect(drawer.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
    await expect(drawer.locator('.el-table__body-wrapper tbody tr')).toHaveCount(1)
    await expect(page.locator('.el-message:visible')).toHaveCount(0)
    await captureBusinessEvidence(drawer, {
      path: info.outputPath(`accrual-original-payable-${position + 1}-top.png`)
    })
    await drawer.locator('.art-drawer__scrollbar > .el-scrollbar__wrap').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await captureBusinessEvidence(drawer, {
      path: info.outputPath(`accrual-original-payable-${position + 1}-lower.png`)
    })
    await drawer.getByRole('button', { name: /关闭此/ }).click()
    await expect(drawer).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})
