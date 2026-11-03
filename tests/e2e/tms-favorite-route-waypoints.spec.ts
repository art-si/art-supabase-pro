import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('常用线路允许三个有序途经点和返程', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    if (name === 'tms_list_customer_options_secure')
      return route.fulfill({ json: [{ id: 'customer-1', customerName: '测试客户' }] })
    if (name === 'tms_list_customer_address_options_secure') return route.fulfill({ json: [] })
    if (name === 'mdm_station')
      return route.fulfill({
        headers: { 'content-range': '0-2/3', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: 'station-1',
            stationCode: 'S001',
            stationName: '第一途经点',
            stationType: 'transfer',
            longitude: 120.1,
            latitude: 30.1
          },
          {
            id: 'station-2',
            stationCode: 'S002',
            stationName: '第二途经点',
            stationType: 'transfer',
            longitude: 120.2,
            latitude: 30.2
          },
          {
            id: 'station-3',
            stationCode: 'S003',
            stationName: '第三途经点',
            stationType: 'transfer',
            longitude: 120.3,
            latitude: 30.3
          }
        ]
      })
    return route.fulfill({ json: [] })
  })

  await page.goto('/tests/e2e/fixtures/tms-favorite-route-waypoints.html')
  const dialog = page.getByRole('dialog').filter({ hasText: '新增常用线路' })
  await expect(dialog).toBeVisible()
  const add = dialog.getByRole('button', { name: '添加途经点' })
  for (let index = 0; index < 3; index += 1) await add.click()
  await expect(add).toHaveCount(0)
  const waypointRows = dialog
    .locator('.el-form-item')
    .filter({ hasText: '途经点' })
    .locator('.el-select')
  await expect(waypointRows).toHaveCount(3)
  await waypointRows.nth(0).click()
  await page.getByRole('option', { name: /第一途经点/ }).click({ timeout: 5_000 })
  await waypointRows.nth(1).click()
  await page.getByRole('option', { name: /第二途经点/ }).click()
  await waypointRows.nth(2).click()
  await page.getByRole('option', { name: /第三途经点/ }).click()
  await dialog.getByRole('button', { name: '上移途经点' }).nth(1).click()
  await expect(dialog.getByText('1. 第二途经点')).toBeVisible()
  await expect(dialog.getByText('2. 第一途经点')).toBeVisible()
  await dialog.locator('.el-form-item').filter({ hasText: '含返程' }).locator('.el-switch').click()
  await expect(dialog.getByText('返程按相反顺序经过这些站点')).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('favorite-route-waypoints.png'),
    animations: 'disabled'
  })
  expect(errors).toEqual([])
})
