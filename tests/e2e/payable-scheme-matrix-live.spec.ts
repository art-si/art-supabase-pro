import assert from 'node:assert/strict'
import { expect, test } from '@playwright/test'
import {
  assertPayableAcceptanceSession,
  acceptanceRecord,
  acceptanceRows,
  acceptanceRpc
} from './support/payable-live-session'
import { prepareAppearance } from './support/appearance'
import { captureBusinessEvidence } from './support/capture-business-evidence'

const enabled = process.env.E2E_PAYABLE_LIVE === 'true'
test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-real.storage.json'
    : { cookies: [], origins: [] },
  trace: 'off'
})
test.skip(!enabled, '仅显式运行独立验收租户的配置检查')
test.setTimeout(180_000)

test('两套真实分关系方案、独立条件与图标刷新视觉验收', async ({ page, context }, info) => {
  const client = await assertPayableAcceptanceSession(context)
  const metadata = acceptanceRecord(
    await acceptanceRpc(client, 'fms_payable_scheme_configuration_secure', {})
  )
  const schemes = acceptanceRows(metadata.schemes).filter((row) =>
    ['QA_RB_MATRIX_MANUAL', 'QA_RB_MATRIX_AUTO'].includes(String(row.code))
  )
  expect(schemes).toHaveLength(2)
  expect(schemes.find((row) => row.code === 'QA_RB_MATRIX_AUTO')?.enabled).toBe(false)
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const workspaceReady = page.waitForResponse(
    (response) => response.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure'),
    { timeout: 60_000 }
  )
  await page.goto('#/fms/accounts-payable/writeoff', { waitUntil: 'domcontentloaded' })
  expect((await workspaceReady).ok()).toBe(true)
  await expect(page.getByRole('heading', { name: '应付核销工作台', exact: true })).toBeVisible({
    timeout: 60_000
  })
  const guide = page.getByRole('button', { name: '知道了', exact: true })
  if (await guide.isVisible()) await guide.click()
  await page.getByRole('button', { name: '核销方案', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '应付核销方案', exact: true })
  for (const scheme of schemes) {
    assert.ok(typeof scheme.code === 'string')
    const automatic = scheme.code === 'QA_RB_MATRIX_AUTO'
    const configs = acceptanceRows(scheme.relation_rules)
    expect(configs).toHaveLength(automatic ? 1 : 2)
    const red = configs.find((row) => row.relation === 'payable_red_blue')
    assert.ok(red)
    expect(acceptanceRows(red.rules).map((row) => row.primary_field)).toEqual(
      automatic ? ['supplier_id'] : ['supplier_id', 'currency_code']
    )
    if (!automatic)
      expect(
        acceptanceRows(configs.find((row) => row.relation === 'payable_payment')?.rules)[0]
          .primary_field
      ).toBe('source_id')
    await settings
      .locator('tbody tr')
      .filter({ hasText: scheme.code })
      .getByRole('button', { name: '编辑方案', exact: true })
      .click()
    const editor = page.getByRole('dialog', { name: '编辑核销方案', exact: true })
    await expect(
      editor.getByRole('switch', { name: '按核销关系分别配置', exact: true })
    ).toBeChecked()
    await expect(editor.locator('.el-table__body-wrapper tbody tr')).toHaveCount(configs.length)
    await captureBusinessEvidence(editor, { path: info.outputPath(`${scheme.code}-editor.png`) })
    if (!automatic && (page.viewportSize()?.height || 900) < 800) {
      const finalRow = editor.locator('.el-table__body-wrapper tbody tr').last()
      await finalRow.scrollIntoViewIfNeeded()
      await expect(
        finalRow.getByRole('button', { name: '配置匹配规则', exact: true })
      ).toBeInViewport()
      await captureBusinessEvidence(editor, {
        path: info.outputPath(`${scheme.code}-editor-lower.png`)
      })
    }
    await editor
      .locator('tbody tr')
      .filter({ hasText: '应付红蓝对冲' })
      .getByRole('button', { name: '配置匹配规则', exact: true })
      .click()
    const rules = page.getByRole('dialog', { name: '核销匹配规则 · 应付红蓝对冲', exact: true })
    await expect(rules.locator('.el-table__body-wrapper tbody tr')).toHaveCount(automatic ? 1 : 2)
    await expect(rules.getByText(/应付冲应收以主数据确认/)).toHaveCount(0)
    await captureBusinessEvidence(rules, { path: info.outputPath(`${scheme.code}-conditions.png`) })
    await rules.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    await editor.getByRole('button', { name: '关闭此对话框', exact: true }).click()
  }
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    '**/rest/v1/rpc/fms_payable_scheme_configuration_secure',
    async (route) => {
      const result = await route.fetch()
      await gate
      await route.fulfill({ response: result })
    },
    { times: 1 }
  )
  const refresh = settings.getByRole('button', { name: '刷新方案', exact: true })
  try {
    await refresh.click()
    await expect(refresh).toHaveAttribute('aria-busy', 'true')
    await expect(settings.locator('.el-loading-mask:visible, .el-skeleton:visible')).toHaveCount(0)
    for (const scheme of schemes)
      await expect(
        settings.locator('tbody tr').filter({ hasText: String(scheme.code) })
      ).toHaveCount(1)
    await captureBusinessEvidence(settings, {
      path: info.outputPath('scheme-matrix-icon-refresh.png')
    })
  } finally {
    release()
  }
  await expect(refresh).not.toHaveAttribute('aria-busy', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
