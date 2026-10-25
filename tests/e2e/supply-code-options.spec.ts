import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)
test('供应链编码规则表格与状态使用公共字典', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const code = url.searchParams.get('dict_type_table.code')
    const value = code?.includes('UseMode')
      ? 'full'
      : code?.includes('DateFormat')
        ? 'YYYYMM'
        : 'enabled'
    return route.fulfill({
      json: url.pathname.endsWith('/sys_dictionary')
        ? [
            { label: '', name: '公共选项名称', value, status: '1' },
            { label: '停用字典项', value: 'obsolete', status: '0' }
          ]
        : []
    })
  })
  await page.goto('/tests/e2e/fixtures/master-dynamic-options.html')
  await page.getByRole('button', { name: '打开供应链规则', exact: true }).click()
  const dialog = page.getByRole('dialog')
  for (const name of ['使用模式', '日期格式']) {
    const select = dialog
      .locator('.el-select')
      .filter({ has: page.getByRole('combobox', { name, exact: true }) })
      .first()
    await select.scrollIntoViewIfNeeded()
    await select.click()
    await expect(page.getByRole('option', { name: '公共选项名称', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: '停用字典项', exact: true })).toHaveCount(0)
    await page.getByRole('option', { name: '公共选项名称', exact: true }).click()
  }
  await page.screenshot({ path: info.outputPath('supply-code-segments.png') })
  const status = dialog.getByRole('radiogroup', { name: '启用状态' })
  await status.scrollIntoViewIfNeeded()
  await expect(status.getByRole('radio', { name: '公共选项名称', exact: true })).toBeChecked()
  await expect(status.getByText('停用字典项', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('supply-code-status.png') })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
