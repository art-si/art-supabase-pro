import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
;[
  'accident',
  'inspection',
  'maintenance',
  'insurance',
  'parts',
  'mileage',
  'routine-inspection',
  'violation'
].forEach((name) => {
  test('车辆面板失败与重试 ' + name, async ({ page }, info) => {
    test.setTimeout(120000)
    await prepareIsolatedSession(page)
    let failed = true
    await page.route('**/rest/v1/rpc/vms_list_vehicle_*_secure', (route) =>
      failed
        ? route.fulfill({
            status: 403,
            json: { code: '42501', message: 'permission denied for relation' }
          })
        : route.fulfill({ json: { records: [{ id: 'test-row', plateNo: '测试车辆' }], total: 1 } })
    )
    await page.goto('/tests/e2e/fixtures/vehicle-panel-errors.html?panel=' + name)
    await expect(page.getByText('当前账号没有此操作权限', { exact: true })).toBeVisible()
    await expect(page.locator('.el-message')).toHaveCount(0)
    if (name === 'maintenance') {
      expect(
        await page.locator('.el-select').evaluate((el) => el.getBoundingClientRect().width)
      ).toBeGreaterThanOrEqual(160)
    }
    if (name === 'maintenance')
      await page.screenshot({ path: info.outputPath('panel-error.png'), fullPage: true })
    if (name === 'parts') {
      expect(
        await page.getByPlaceholder('零部件名称').evaluate((el) => el.getBoundingClientRect().width)
      ).toBeGreaterThanOrEqual(160)
      await page.screenshot({ path: info.outputPath('parts-error.png'), fullPage: true })
    }
    failed = false
    await page.getByRole('button', { name: '重新加载' }).click()
    await expect(page.locator('.el-table__row').first()).toBeVisible()
    await expect(page.getByRole('button', { name: '重新加载' })).toHaveCount(0)
    if (name === 'maintenance')
      await page.screenshot({ path: info.outputPath('panel-retry.png'), fullPage: true })
  })
})
