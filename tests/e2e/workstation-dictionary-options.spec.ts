import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)

test('工位筛选与编辑复用布尔字典并过滤停用选项', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/rest/v1/**', async (route) => {
    const table = new URL(route.request().url()).pathname.split('/').pop()
    if (table === 'sys_dictionary') await gate
    const rows =
      table === 'sys_dictionary'
        ? [
            { label: '', name: '公共启用名称', value: 'true', status: '1' },
            { label: '停用字典项', value: 'false', status: '0' }
          ]
        : table === 'mdm_production_department'
          ? [
              {
                id: 'root',
                tenant_id: 'permission-test-tenant',
                code: 'ROOT',
                name: '测试工厂',
                enabled: true
              },
              {
                id: 'shop',
                parent_id: 'root',
                tenant_id: 'permission-test-tenant',
                code: 'SHOP',
                name: '测试车间',
                enabled: true
              }
            ]
          : table === 'mdm_work_center'
            ? [
                {
                  id: 'center',
                  department_id: 'shop',
                  tenant_id: 'permission-test-tenant',
                  code: 'WC',
                  name: '测试中心',
                  sort: 1
                }
              ]
            : []
    await route.fulfill({
      json: rows,
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
    })
  })
  await page.goto('/tests/e2e/fixtures/workstation-delete.html')
  const field = page
    .locator('.art-search-bar .el-form-item')
    .filter({ has: page.getByText('启用状态', { exact: true }) })
  await field.locator('.el-select').click()
  release()
  await expect(page.getByRole('option', { name: '公共启用名称', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: '停用字典项', exact: true })).toHaveCount(0)
  await page.getByRole('option', { name: '公共启用名称', exact: true }).click()
  await page.screenshot({ path: info.outputPath('workstation-filter.png') })
  await page.getByRole('button', { name: '新增工位', exact: true }).click()
  const enabled = page.getByRole('dialog').getByRole('radiogroup', { name: '启用状态' })
  await enabled.scrollIntoViewIfNeeded()
  await expect(enabled.getByRole('radio', { name: '公共启用名称', exact: true })).toBeChecked()
  await expect(enabled.getByText('停用字典项', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('workstation-dialog.png') })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
