import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('常用线路同名长站点在窄屏可按编号辨认，改序后按站点 ID 保存', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 820 })
  const longStationName = '华东重工综合物流产业园临港智能集配运营中心站点'
  const writes: Array<Record<string, unknown>> = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    if (name === 'tms_list_customer_options_secure')
      return route.fulfill({ json: [{ id: 'customer-1', customerName: '测试客户' }] })
    if (name === 'tms_list_customer_address_options_secure') {
      const origin = route.request().postDataJSON().p_address_type === 'shipping'
      return route.fulfill({
        json: [
          {
            id: origin ? 'origin-1' : 'destination-1',
            addressDetail: origin ? '装货测试地址' : '卸货测试地址'
          }
        ]
      })
    }
    if (name === 'tms_favorite_route' && route.request().method() === 'POST') {
      const payload = route.request().postDataJSON()
      writes.push(payload)
      return route.fulfill({ json: { id: 'route-1', ...payload } })
    }
    if (name === 'mdm_station')
      return route.fulfill({
        headers: { 'content-range': '0-2/3', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: 'station-1',
            stationCode: 'S001',
            stationName: longStationName,
            stationType: 'transfer',
            longitude: 120.1,
            latitude: 30.1
          },
          {
            id: 'station-2',
            stationCode: 'S002',
            stationName: longStationName,
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

  await page.goto('/tests/e2e/fixtures/tms-favorite-route-waypoints.html', {
    waitUntil: 'domcontentloaded'
  })
  const dialog = page.getByRole('dialog', { name: '新增常用线路' })
  await expect(dialog).toBeVisible()
  const add = dialog.getByRole('button', { name: '添加途经点' })
  for (let index = 0; index < 3; index += 1) await add.click()
  await expect(add).toHaveCount(0)
  const waypointRows = dialog
    .locator('.el-form-item')
    .filter({ hasText: '途经点' })
    .locator('.el-select')
  await expect(waypointRows).toHaveCount(3)
  await expect
    .poll(() => waypointRows.first().evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThanOrEqual(132)
  await waypointRows.nth(0).click()
  const popup = page.locator('.el-select__popper:visible')
  await expect(popup).toBeVisible()
  await expect
    .poll(() =>
      popup.evaluate((surface) => {
        const { left, right } = surface.getBoundingClientRect()
        return Math.max(
          -left,
          right - innerWidth,
          document.documentElement.scrollWidth - innerWidth
        )
      })
    )
    .toBeLessThanOrEqual(1)
  for (const code of ['S001', 'S002']) {
    const option = popup.getByRole('option', { name: new RegExp(code) })
    await expect(option.getByText(code, { exact: true })).toBeInViewport({ ratio: 0.95 })
    await expect(option.getByText(longStationName, { exact: true })).toHaveCSS(
      'white-space',
      'nowrap'
    )
    await expect(option.locator('[title]')).toHaveAttribute(
      'title',
      `${longStationName}（${code}）`
    )
  }
  await page.screenshot({ path: testInfo.outputPath('favorite-route-waypoint-options-390.png') })
  await popup.getByRole('option', { name: /S001/ }).click()
  await waypointRows.nth(1).click()
  await popup.getByRole('option', { name: /S002/ }).click()
  await waypointRows.nth(2).click()
  await page.getByRole('option', { name: /第三途经点/ }).click()
  for (let index = 1; index <= 3; index += 1) {
    await expect(dialog.getByRole('button', { name: `上移第 ${index} 个途经点` })).toHaveCount(1)
    await expect(dialog.getByRole('button', { name: `下移第 ${index} 个途经点` })).toHaveCount(1)
  }
  await dialog.getByRole('button', { name: '上移第 2 个途经点' }).press('Enter')
  await expect(waypointRows.nth(0).getByText('S002', { exact: true })).toBeInViewport({
    ratio: 0.95
  })
  await expect(waypointRows.nth(1).getByText('S001', { exact: true })).toBeInViewport({
    ratio: 0.95
  })
  await expect(waypointRows.nth(0).locator('[title]')).toHaveAttribute(
    'title',
    `${longStationName}（S002）`
  )
  await dialog.locator('.el-form-item').filter({ hasText: '含返程' }).locator('.el-switch').click()
  await expect(dialog.getByText('返程按相反顺序经过这些站点')).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('favorite-route-waypoints.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('textbox', { name: /线路名称/ }).fill('同名站点回归线路')
  for (const [field, option] of [
    ['customerId', '测试客户'],
    ['originAddressId', '装货测试地址'],
    ['destinationAddressId', '卸货测试地址']
  ]) {
    await dialog.locator(`[data-art-form-item-key="${field}"] .el-select`).click()
    await popup.getByRole('option', { name: new RegExp(option) }).click()
  }
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect
    .poll(() => writes.at(-1))
    .toMatchObject({
      waypoint_station_ids: ['station-2', 'station-1', 'station-3'],
      return_trip: true
    })
  await expect(dialog).toBeHidden()
  expect(errors).toEqual([])
})
