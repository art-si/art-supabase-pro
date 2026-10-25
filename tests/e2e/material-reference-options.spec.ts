import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)
test('物料引用列表状态筛选使用公共字典名称', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith('/sys_dictionary')
        ? [
            { label: '', name: '公共启用名称', value: 'enabled', status: '1' },
            { label: '停用字典项', value: 'obsolete', status: '0' }
          ]
        : [],
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
    })
  )
  await page.goto('/tests/e2e/fixtures/master-dynamic-options.html?mode=reference-list')
  const select = page.locator('.art-search-bar .el-select')
  await select.click()
  await expect(page.getByRole('option', { name: '公共启用名称', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: '停用字典项', exact: true })).toHaveCount(0)
  await page.getByRole('option', { name: '公共启用名称', exact: true }).click()
  await page.screenshot({ path: info.outputPath('material-reference-filter.png') })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
})
test('物料编码规则复用公共字典选项', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const code = url.searchParams.get('dict_type_table.code')
    const value = code?.includes('SegmentSource')
      ? 'date'
      : code?.includes('DateFormat')
        ? 'YYYYMM'
        : code?.includes('Strategy')
          ? 'material_type'
          : 'enabled'
    await route.fulfill({
      json: url.pathname.endsWith('/sys_dictionary')
        ? [
            { label: '', name: '公共字典名称', value, status: '1' },
            { label: '停用字典项', value: 'obsolete', status: '0' }
          ]
        : []
    })
  })
  await page.goto('/tests/e2e/fixtures/master-dynamic-options.html')
  await page.getByRole('button', { name: '打开编码规则', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const choose = async (select: ReturnType<typeof page.locator>) => {
    await select.scrollIntoViewIfNeeded()
    await select.click()
    await expect(page.getByRole('option', { name: '公共字典名称', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: '停用字典项', exact: true })).toHaveCount(0)
    await page.getByRole('option', { name: '公共字典名称', exact: true }).click()
  }
  await choose(
    dialog
      .locator('.el-form-item')
      .filter({ has: page.getByText('归类策略', { exact: true }) })
      .locator('.el-select')
  )
  await choose(
    dialog
      .locator('.el-select')
      .filter({ has: page.getByRole('combobox', { name: '号段来源' }) })
      .first()
  )
  await choose(
    dialog.locator('.material-reference-dialog__builder-row').first().locator('.el-select').nth(1)
  )
  const actions = dialog
    .locator('.material-reference-dialog__builder-row')
    .first()
    .locator('.business-table-row-actions')
  await expect(actions).toHaveCount(1)
  await expect(actions.getByRole('button')).toHaveCount(3)
  expect(await actions.evaluate((element) => getComputedStyle(element).gap)).toBe('8px')
  expect(
    await actions.evaluate((element) => {
      const parent = element.closest('.el-dialog')
      if (!parent) throw new Error('号段操作缺少所属弹窗')
      return element.getBoundingClientRect().right <= parent.getBoundingClientRect().right
    })
  ).toBe(true)
  await expect(actions.getByRole('button', { name: '上移号段', exact: true })).toBeDisabled()
  await page.screenshot({ path: info.outputPath('code-rule-dictionaries.png') })
  await choose(
    dialog
      .locator('.el-form-item')
      .filter({ has: page.getByText('启用状态', { exact: true }) })
      .locator('.el-select')
  )
  await page.screenshot({ path: info.outputPath('code-rule-status.png') })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
