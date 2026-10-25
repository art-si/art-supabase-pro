import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)
test('采购初始化异常使用公共友好错误并允许重试', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let requests = 0
  await page.route('**/rest/v1/**', (route) => {
    const source = new URL(route.request().url()).pathname.endsWith('/scm_purchase_document')
    if (source) requests++
    return route.fulfill({
      status: source ? 500 : 200,
      json: source
        ? { message: 'SQL SELECT secret_internal_column FROM private_table', code: 'XX000' }
        : []
    })
  })
  await page.goto('/tests/e2e/fixtures/warehouse-selector-reuse.html')
  await page.getByRole('button', { name: '打开采购加载校验', exact: true }).click()
  const alert = page
    .getByRole('dialog')
    .locator('.el-alert')
    .filter({ hasText: '基础数据加载失败' })
  await expect(alert).toBeVisible()
  await expect(page.getByRole('dialog').locator('.art-dialog__viewport')).toHaveAttribute(
    'aria-busy',
    'false'
  )
  await expect(alert).not.toContainText('secret_internal_column')
  await expect(alert).not.toContainText('SELECT')
  const before = requests
  await alert.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect.poll(() => requests).toBeGreaterThan(before)
  await expect(page.getByRole('dialog').locator('.art-dialog__viewport')).toHaveAttribute(
    'aria-busy',
    'false'
  )
  await expect(alert).toBeVisible()
  await page.screenshot({ path: info.outputPath('purchase-friendly-error.png') })
  expect(errors).toEqual([])
})
