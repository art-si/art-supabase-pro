import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(240_000)

test('返程配货使用共享表单并保持响应式布局', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/rpc/tms_list_return_trip_candidates_secure', (route) =>
    route.fulfill({
      json: [
        {
          id: 'waybill-return-test',
          waybillNo: 'WB-RETURN-001',
          status: 'transporting',
          orderId: 'order-return-test',
          hasReturnLeg: false
        }
      ]
    })
  )
  await page.route('**/rest/v1/rpc/tms_get_return_shared_toll_secure', (route) =>
    route.fulfill({ json: 128.5 })
  )

  await page.goto('/tests/e2e/fixtures/tms-return-trip-drawer.html')
  const drawer = page.locator('.art-drawer').filter({ hasText: '新增返程配货' })
  await expect(drawer).toBeVisible({ timeout: 90_000 })
  await expect(drawer.getByText('WB-RETURN-001', { exact: true })).toBeVisible()
  const routeItems = drawer.locator('.el-form-item')
  await expect(routeItems.filter({ hasText: '始发地' }).locator('input')).toHaveValue('杭州门店', {
    timeout: 120_000
  })
  await expect(routeItems.filter({ hasText: '目的地' }).locator('input')).toHaveValue('上海仓')
  await expect(drawer.getByText('返程货物重量（吨）', { exact: true })).toBeVisible()
  await expect(drawer.getByText('返程货物体积（立方米）', { exact: true })).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({
    path: testInfo.outputPath('return-trip-desktop.png'),
    animations: 'disabled'
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(drawer).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({
    path: testInfo.outputPath('return-trip-mobile.png'),
    animations: 'disabled'
  })
  expect(errors).toEqual([])
})
