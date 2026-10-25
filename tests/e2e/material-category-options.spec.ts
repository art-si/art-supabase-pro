import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)
for (const mode of ['list', 'dialog']) {
  test(`物料分类公共字典 ${mode}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({
        json: new URL(route.request().url()).pathname.endsWith('/sys_dictionary')
          ? [
              { label: '', name: '公共分类名称', value: 'enabled', status: '1' },
              { label: '停用字典项', value: 'obsolete', status: '0' }
            ]
          : [],
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
      })
    )
    await page.goto(`/tests/e2e/fixtures/material-category-options.html?mode=${mode}`)
    if (mode === 'dialog') await page.getByRole('button', { name: '打开分类', exact: true }).click()
    const scope = mode === 'list' ? page.locator('.art-search-bar') : page.getByRole('dialog')
    for (const label of mode === 'list' ? ['启用状态'] : ['描述组成字段', '计价方法', '状态']) {
      const field = scope
        .locator('.el-form-item')
        .filter({ has: page.getByText(label, { exact: true }) })
      await field.scrollIntoViewIfNeeded()
      await field.locator('.el-select').click()
      await expect(page.getByRole('option', { name: '公共分类名称', exact: true })).toBeVisible()
      await expect(page.getByRole('option', { name: '停用字典项', exact: true })).toHaveCount(0)
      await page.getByRole('option', { name: '公共分类名称', exact: true }).click()
      if (label === '描述组成字段') await page.keyboard.press('Escape')
      await page.screenshot({ path: info.outputPath(`${label}.png`) })
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
