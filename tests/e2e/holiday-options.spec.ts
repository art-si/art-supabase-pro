import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)
test('假期公共字典名称回退与停用过滤', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith('/sys_dictionary')
        ? [
            { label: '', name: '公共假期名称', value: 'holiday', status: '1' },
            { label: '停用字典项', value: 'obsolete', status: '0' }
          ]
        : []
    })
  )
  await page.goto('/tests/e2e/fixtures/holiday-options.html')
  await page.getByRole('button', { name: '打开假期', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const field = dialog
    .locator('.el-form-item')
    .filter({ has: page.getByText('假期类型', { exact: true }) })
  await field.scrollIntoViewIfNeeded()
  await field.locator('.el-select').click()
  await expect(page.getByRole('option', { name: '公共假期名称', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: '停用字典项', exact: true })).toHaveCount(0)
  await page.getByRole('option', { name: '公共假期名称', exact: true }).click()
  await expect(dialog.getByRole('combobox', { name: /开始日期/ })).toHaveValue('2026-10-01')
  await page.screenshot({ path: info.outputPath('holiday-options.png') })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
