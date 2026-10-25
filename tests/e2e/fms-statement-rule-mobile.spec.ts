import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

test('报表规则窄屏表单保留字段校验与完整布局', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/rest/v1/**', async (route) => {
    await route.fulfill({ json: [] })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tests/e2e/fixtures/fms-statement-rule-mobile.html')
  const dialog = page.getByRole('dialog', { name: '配置科目取数' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('尚未配置科目映射')).toBeVisible()
  await dialog.getByRole('button', { name: '添加第一条规则' }).click()
  await expect(dialog.getByText('第 1 条规则')).toBeVisible()
  await dialog.getByRole('button', { name: '保存取数规则' }).click()
  await expect(dialog.getByText('请选择取数来源')).toBeVisible()
  await expect(dialog).toBeVisible()

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
  await page.screenshot({
    path: '.artifacts/fms-statement-rule-mobile-validation.png',
    animations: 'disabled'
  })
  expect(pageErrors).toEqual([])
})
