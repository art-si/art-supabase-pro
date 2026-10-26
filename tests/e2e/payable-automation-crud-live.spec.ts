import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import {
  assertPayableAcceptanceSession,
  acceptanceRecord as record,
  acceptanceRows as rows,
  acceptanceRpc as rpc
} from './support/payable-live-session'
import { captureBusinessEvidence } from './support/capture-business-evidence'

const enabled = process.env.E2E_PAYABLE_LIVE === 'true'
test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-real.storage.json'
    : { cookies: [], origins: [] },
  trace: 'off'
})
test.skip(!enabled, '仅显式创建和删除独立验收租户的未使用后台配置')
test.setTimeout(300_000)

test('普通账号两条未使用后台配置新增编辑及守卫确认删除', async ({ page, context }, info) => {
  const client = await assertPayableAcceptanceSession(context)
  const initial = record(
    await rpc(client, 'fms_payable_automation_workspace_secure', { p_query: { size: 100 } })
  )
  const initialConfigurations = rows(record(initial.configurations).data)
  const initialJobTotal = record(initial.jobs).total
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('#/fms/accounts-payable/writeoff', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '应付核销工作台', exact: true })).toBeVisible({
    timeout: 60_000
  })
  const guide = page.getByRole('button', { name: '知道了', exact: true })
  if (await guide.isVisible()) await guide.click()
  await page.getByRole('button', { name: '后台核销', exact: true }).click()
  const workspace = page.getByRole('dialog', { name: '后台自动核销', exact: true })
  for (const [index, code] of ['QA_RB_MATRIX_MANUAL', 'QA_RB_MATRIX_AUTO'].entries()) {
    const scheme = rows(initial.schemes).find((row) => row.code === code)
    assert.ok(scheme)
    const book = rows(initial.books).find((row) => row.tenant_id === scheme.tenant_id && row.active)
    assert.ok(book)
    const prior = initialConfigurations.find(
      (row) => row.scheme_id === scheme.id && row.account_set_id === book.id
    )
    if (prior) {
      assert.ok(String(prior.name).startsWith('后台CRUD验收'))
      expect(prior.enabled).toBe(false)
      expect(Number(prior.job_count)).toBe(0)
      await workspace
        .locator('tbody tr')
        .filter({ hasText: String(prior.name) })
        .getByRole('button', { name: '编辑后台配置', exact: true })
        .click()
    } else await workspace.getByRole('button', { name: '新增配置', exact: true }).click()
    const editor = page.getByRole('dialog', {
      name: prior ? '编辑后台核销配置' : '新增后台核销配置',
      exact: true
    })
    const name = `后台CRUD验收${index + 1}`
    await editor.getByRole('textbox', { name: /配置名称$/ }).fill(name)
    if (!prior) {
      await editor.getByRole('combobox', { name: /核销方案$/ }).press('Enter')
      await page
        .getByRole('option', { name: `${scheme.name} · ${scheme.code}`, exact: true })
        .click()
      await editor.getByRole('combobox', { name: /核算账套$/ }).press('Enter')
      await page.getByRole('option', { name: `${book.name} · ${book.code}`, exact: true }).click()
    }
    await expect(editor.getByRole('switch', { name: '后台启用', exact: true })).not.toBeChecked()
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/rpc/fms_save_payable_automation_secure') &&
        response.request().postDataJSON()?.p_record?.name === name
    )
    await editor.getByRole('button', { name: '保存后台配置', exact: true }).click()
    const createdResponse = await created
    expect(createdResponse.ok()).toBe(true)
    const id: unknown = await createdResponse.json()
    assert.equal(typeof id, 'string')
    await expect(editor).not.toBeVisible()
    const createdRow = workspace.locator('tbody tr').filter({ hasText: name })
    await expect(createdRow).toContainText('否')
    await captureBusinessEvidence(workspace, {
      path: info.outputPath(`background-crud-${index + 1}-created.png`)
    })
    await createdRow.getByRole('button', { name: '编辑后台配置', exact: true }).click()
    const editing = page.getByRole('dialog', { name: '编辑后台核销配置', exact: true })
    await editing.getByRole('textbox', { name: /配置名称$/ }).fill(`${name}已更新`)
    await editing.getByRole('button', { name: '保存后台配置', exact: true }).click()
    await expect(editing).not.toBeVisible()
    const refreshed = record(
      await rpc(client, 'fms_payable_automation_workspace_secure', {
        p_query: { automation_id: id }
      })
    )
    const current = rows(record(refreshed.configurations).data)[0]
    expect(current.name).toBe(`${name}已更新`)
    expect(current.enabled).toBe(false)
    expect(Number(current.job_count)).toBe(0)
    const inspected = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith(
          '/rpc/get_fms_payable_automation_delete_dependencies_secure'
        ) && response.request().postDataJSON()?.p_ids?.includes(id),
      { timeout: 30_000 }
    )
    await workspace
      .locator('tbody tr')
      .filter({ hasText: `${name}已更新` })
      .getByRole('button', { name: '删除后台配置', exact: true })
      .click()
    const inspectedResponse = await inspected
    expect(inspectedResponse.ok()).toBe(true)
    expect(await inspectedResponse.json()).toEqual([])
    const confirmation = page.getByRole('dialog', { name: '删除确认', exact: true })
    await expect(confirmation).toContainText(`${name}已更新`)
    await captureBusinessEvidence(confirmation, {
      path: info.outputPath(`background-crud-${index + 1}-delete-confirmation.png`)
    })
    const deleted = page.waitForResponse(
      (response) =>
        response.url().endsWith('/rpc/fms_delete_payable_automation_secure') &&
        response.request().postDataJSON()?.p_id === id
    )
    await confirmation.getByRole('button', { name: '删除', exact: true }).click()
    const deletedResponse = await deleted
    expect(deletedResponse.ok()).toBe(true)
    expect(deletedResponse.request().postDataJSON().p_expected_version).toBe(current.version)
    expect(await deletedResponse.json()).toBe(true)
    await expect(workspace.locator('tbody tr').filter({ hasText: `${name}已更新` })).toHaveCount(0)
    appendFileSync(
      '.artifacts/payable-background-crud-live-records.jsonl',
      JSON.stringify({
        id,
        scheme: code,
        name,
        version: current.version,
        deletedAfterGuard: true
      }) + '\n'
    )
  }
  const final = record(
    await rpc(client, 'fms_payable_automation_workspace_secure', { p_query: { size: 100 } })
  )
  expect(record(final.jobs).total).toBe(initialJobTotal)
  expect(
    rows(record(final.configurations).data).filter((row) =>
      String(row.name).startsWith('独立后台核销')
    )
  ).toHaveLength(2)
  expect(errors).toEqual([])
})
