import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

test('保险公司弹窗区分字段校验与服务拒绝', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)

  let requests = 0
  await page.route('**/rest/v1/mdm_insurance_company**', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    requests += 1
    await route.fulfill({
      status: 403,
      json: { code: '42501', message: 'permission denied for relation' }
    })
  })

  await page.goto('/tests/e2e/fixtures/scrollbar-workspace.html?page=form-reuse')
  await page.getByRole('button', { name: '新增保险公司', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增保险公司' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.art-async-state[aria-busy="true"]')).toHaveCount(0, {
    timeout: 30_000
  })

  await dialog.getByRole('button', { name: '确定' }).click()
  await expect(dialog.getByText('请输入保险公司名称')).toBeVisible()
  expect(requests).toBe(0)
  await expect(page.locator('.el-message')).toHaveCount(0)

  await dialog.getByRole('textbox', { name: '保险公司名称' }).fill('测试保险公司')
  await dialog.getByRole('button', { name: '确定' }).click()
  await expect(page.locator('.el-message')).toHaveCount(1)
  await expect(page.locator('.el-message')).toContainText('当前账号没有此操作权限')
  expect(requests).toBe(1)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '确定' })).toBeEnabled()

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
  await page.screenshot({
    path: `.artifacts/vms-insurance-company-${testInfo.project.name}-error.png`,
    animations: 'disabled'
  })
})
