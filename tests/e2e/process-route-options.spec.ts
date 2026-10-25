import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
// The real route editor also loads the material picker and reference panels on a cold Vite server.
test.setTimeout(300_000)
for (const mode of ['list', 'dialog']) {
  test(`工艺路线公共字典 ${mode}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({
        json: new URL(route.request().url()).pathname.endsWith('/sys_dictionary')
          ? [
              { label: '', name: '公共路线名称', value: 'true', status: '1' },
              { label: '停用字典项', value: 'obsolete', status: '0' }
            ]
          : new URL(route.request().url()).pathname.endsWith('/mdm_process_route_references')
            ? {
                groups: [],
                operations: [],
                controlCodes: [],
                units: [],
                departments: [],
                workCenters: [],
                activityFormulas: [],
                suppliers: [],
                esopDocuments: []
              }
            : [],
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
      })
    )
    await page.goto(`/tests/e2e/fixtures/process-route-options.html?mode=${mode}`)
    if (mode === 'dialog') await page.getByRole('button', { name: '打开路线', exact: true }).click()
    const scope = mode === 'list' ? page.locator('.art-search-bar') : page.getByRole('dialog')
    for (const label of mode === 'list' ? ['启用状态'] : ['路线类型', '分配方式', '来源']) {
      const field = scope
        .locator('.el-form-item')
        .filter({ has: page.getByText(label, { exact: true }) })
      await field.scrollIntoViewIfNeeded()
      await field.locator('.el-select').click()
      await expect(page.getByRole('option', { name: '公共路线名称', exact: true })).toBeVisible()
      await expect(page.getByRole('option', { name: '停用字典项', exact: true })).toHaveCount(0)
      await page.getByRole('option', { name: '公共路线名称', exact: true }).click()
    }
    if (mode === 'dialog') {
      for (const label of ['默认路线', '自定义单位换算', '启用状态']) {
        const field = scope
          .locator('.el-form-item')
          .filter({ has: page.getByText(label, { exact: true }) })
        await field.scrollIntoViewIfNeeded()
        await field.getByText('公共路线名称', { exact: true }).click()
        await expect(field.getByRole('radio', { name: '公共路线名称', exact: true })).toBeChecked()
      }
    }
    await page.screenshot({ path: info.outputPath('options.png') })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
