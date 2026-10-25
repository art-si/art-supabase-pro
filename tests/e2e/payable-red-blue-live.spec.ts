import assert from 'node:assert/strict'
import { expect, test } from '@playwright/test'
import {
  assertPayableAcceptanceSession,
  acceptanceRecord,
  acceptanceRows
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
test.skip(!enabled, '仅显式运行独立验收租户的只读红蓝工作台检查')
test.setTimeout(180_000)

test('红蓝工作台真实候选、自动预览与无遮罩刷新', async ({ page, context }, info) => {
  await assertPayableAcceptanceSession(context)
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
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
      response.request().postDataJSON()?.p_query?.relation === 'payable_red_blue'
  )
  await page.getByRole('radio', { name: '应付红蓝对冲', exact: true }).locator('..').click()
  const response = await switched
  expect(response.ok()).toBe(true)
  const workspace = acceptanceRecord(await response.json())
  const credits = acceptanceRows(workspace.secondary)
  expect(credits.length).toBeGreaterThanOrEqual(2)
  const secondary = page.getByRole('region', { name: '红字财务应付单', exact: true })
  await expect(secondary.locator('tbody tr')).toHaveCount(credits.length)
  await expect(
    page.getByRole('switch', { name: '允许跨往来单位核销', exact: true })
  ).not.toBeChecked()
  await secondary.scrollIntoViewIfNeeded()
  await captureBusinessEvidence(page, {
    path: info.outputPath('red-blue-candidates.png'),
    fullPage: true
  })

  let releaseResponse = () => {}
  const gate = new Promise<void>((resolve) => {
    releaseResponse = resolve
  })
  await page.route(
    '**/rest/v1/rpc/fms_payable_writeoff_workspace_secure',
    async (route) => {
      const result = await route.fetch()
      await gate
      await route.fulfill({ response: result })
    },
    { times: 1 }
  )
  const refreshed = page.waitForResponse((entry) =>
    entry.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure')
  )
  const refresh = page.getByRole('button', { name: '刷新', exact: true })
  try {
    await refresh.click()
    await expect(refresh).toHaveAttribute('aria-busy', 'true')
    await expect(page.locator('.el-loading-mask:visible, .el-skeleton:visible')).toHaveCount(0)
    await expect(secondary.locator('tbody tr')).toHaveCount(credits.length)
    await captureBusinessEvidence(page, {
      path: info.outputPath('red-blue-icon-refresh.png'),
      fullPage: true
    })
  } finally {
    releaseResponse()
  }
  expect((await refreshed).ok()).toBe(true)
  await expect(refresh).not.toHaveAttribute('aria-busy', 'true')

  const automatic = acceptanceRows(workspace.schemes).find(
    (scheme) => scheme.enabled && scheme.automatic
  )
  assert.ok(automatic && typeof automatic.name === 'string')
  await page.getByLabel('核销方案', { exact: true }).click()
  await page.getByRole('option', { name: automatic.name, exact: true }).click()
  const preview = page.waitForResponse((entry) =>
    entry.url().endsWith('/rpc/fms_auto_payable_writeoff_secure')
  )
  await page.getByRole('button', { name: '按方案自动核销', exact: true }).click()
  expect((await preview).ok()).toBe(true)
  const dialog = page.getByRole('dialog', { name: '按方案自动核销', exact: true })
  await expect(dialog.getByRole('radio', { name: '本位币等值分配', exact: true })).toBeChecked()
  const repriced = page.waitForResponse(
    (entry) =>
      entry.url().endsWith('/rpc/fms_auto_payable_writeoff_secure') &&
      entry.request().postDataJSON()?.p_query?.cross_currency_mode === 'full_pair'
  )
  await dialog.getByRole('radio', { name: '匹配余量全部对冲', exact: true }).locator('..').click()
  expect((await repriced).ok()).toBe(true)
  await expect(dialog.getByText(/差额计入汇兑损益/)).toBeVisible()
  await captureBusinessEvidence(dialog, { path: info.outputPath('red-blue-auto-preview.png') })
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
