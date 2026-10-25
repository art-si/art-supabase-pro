import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)
for (const view of ['quality', 'changes', 'matches', 'outbox']) {
  test(`治理列表公共字典 ${view}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      return route.fulfill({
        json: url.pathname.endsWith('/sys_dictionary')
          ? [
              { label: '', name: '公共列表名称', value: 'active', status: '1' },
              { label: '停用字典项', value: 'obsolete', status: '0' }
            ]
          : [],
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
      })
    })
    await page.goto(`/tests/e2e/fixtures/governance-user-state.html?view=${view}`)
    for (const label of view === 'quality' ? ['状态', '严重级别'] : ['状态']) {
      const select = page
        .locator(`#pane-${view} .art-search-bar .el-form-item`)
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator('.el-select')
      await select.scrollIntoViewIfNeeded()
      await select.click()
      await expect(page.getByRole('option', { name: '公共列表名称', exact: true })).toBeVisible()
      await expect(page.getByRole('option', { name: '停用字典项', exact: true })).toHaveCount(0)
      await page.getByRole('option', { name: '公共列表名称', exact: true }).click()
    }
    await page.screenshot({ path: info.outputPath(`${view}-filter.png`) })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
test('治理配置复用公共域与严重级别字典', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    return route.fulfill({
      json: url.pathname.endsWith('/sys_dictionary')
        ? [
            {
              label: '',
              name: '公共治理名称',
              value: url.search.includes('mdmGovernanceDomain') ? 'material' : 'warning',
              status: '1'
            },
            { label: '停用字典项', value: 'obsolete', status: '0' }
          ]
        : []
    })
  })
  await page.goto('/tests/e2e/fixtures/governance-user-state.html')
  for (const action of ['配置责任人', '配置质量规则']) {
    await page.getByRole('button', { name: action, exact: true }).click()
    const dialog = page.getByRole('dialog')
    for (const label of action === '配置责任人' ? ['治理域'] : ['治理域', '严重级别']) {
      const select = dialog
        .locator('.el-form-item')
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator('.el-select')
      await select.scrollIntoViewIfNeeded()
      await select.click()
      await expect(page.getByRole('option', { name: '公共治理名称', exact: true })).toBeVisible()
      await expect(page.getByRole('option', { name: '停用字典项', exact: true })).toHaveCount(0)
      await page.getByRole('option', { name: '公共治理名称', exact: true }).click()
    }
    await page.screenshot({ path: info.outputPath(`${action}.png`) })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toBeHidden()
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
