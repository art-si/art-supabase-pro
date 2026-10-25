import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)

for (const mode of ['bom-list', 'catalog-list', 'bom']) {
  test(`BOM 和目录复用公共字典 ${mode}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      return route.fulfill({
        json: url.pathname.endsWith('/sys_dictionary')
          ? [
              { label: '', name: '公共选项名称', value: 'production', status: '1' },
              { label: '停用选项', value: 'obsolete', status: '0' }
            ]
          : []
      })
    })
    await page.goto(`/tests/e2e/fixtures/engineering-dictionary-options.html?mode=${mode}`)
    if (mode === 'bom') await page.getByRole('button', { name: '打开表单' }).click()
    const scope =
      mode === 'bom'
        ? page.getByRole('dialog', { name: '编辑 BOM', exact: true })
        : page.locator('.art-search-bar')
    for (const label of mode === 'catalog-list'
      ? ['生命周期', '资料质量']
      : mode === 'bom-list'
        ? ['BOM 用途', '生命周期']
        : ['BOM 用途']) {
      const field = scope
        .locator('.el-form-item')
        .filter({ has: page.getByText(label, { exact: true }) })
      await field.locator('.el-select').click()
      await expect(page.getByRole('option', { name: '公共选项名称', exact: true })).toBeVisible()
      await expect(page.getByRole('option', { name: '停用选项', exact: true })).toHaveCount(0)
      await page.getByRole('option', { name: '公共选项名称', exact: true }).click()
    }
    await page.screenshot({ path: info.outputPath(`${mode}.png`) })
    if (mode === 'bom') {
      for (const label of ['发料方式', '倒冲方式', '超发控制方式']) {
        await scope
          .getByRole('combobox', { name: label, exact: true })
          .locator('xpath=ancestor::div[contains(@class, "el-select__wrapper")]')
          .click()
        await expect(page.getByRole('option', { name: '公共选项名称', exact: true })).toBeVisible()
        await expect(page.getByRole('option', { name: '停用选项', exact: true })).toHaveCount(0)
        await page.getByRole('option', { name: '公共选项名称', exact: true }).click()
        await scope.screenshot({ path: info.outputPath(`${label}.png`) })
      }
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
