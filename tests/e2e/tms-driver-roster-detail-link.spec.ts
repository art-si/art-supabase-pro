import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(600_000)

const driverId = '11111111-1111-4111-8111-111111111401'
const driver = {
  id: driverId,
  tenantId: '11111111-1111-4111-8111-111111111111',
  driverName: '验收司机甲',
  carrierId: '11111111-1111-4111-8111-111111111501',
  carrier: { companyName: '验收承运商' },
  driverType: 'primary',
  gender: 'male',
  licenseType: 'A2',
  enabled: true,
  assignedVehicles: [],
  fieldAccess: {}
}

test('司机资料姓名进入对应综合查询详情，编辑入口独立', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => {
    errors.push(error.message)
    process.stderr.write(`司机姓名导航页面错误：${error.message}\n`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error')
      process.stderr.write(`司机姓名导航浏览器错误：${message.text()}\n`)
  })
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'tms_list_drivers_secure')
      return route.fulfill({ json: { records: [driver], total: 1, fieldAccess: {} } })
    if (endpoint === 'tms_get_driver_secure') return route.fulfill({ json: driver })
    if (endpoint === 'tms_list_transport_mainline_relations_secure')
      return route.fulfill({ json: { records: [], total: 0 } })
    return route.fulfill({ json: null })
  })

  await page.goto('/tests/e2e/fixtures/tms-mainline-visual.html?page=driver-roster', {
    waitUntil: 'domcontentloaded'
  })
  const nameLink = page.getByRole('link', { name: '验收司机甲' })
  await expect(nameLink).toBeVisible({ timeout: 120_000 })
  await expect(nameLink).toHaveAttribute('href', `/tms/driver-query/detail/${driverId}`)
  await expect(page.getByRole('button', { name: '编辑' })).toBeVisible()
  await nameLink.evaluate((element) => (element as HTMLAnchorElement).click())
  await expect(page.locator('.driver-query-detail')).toBeVisible({ timeout: 120_000 })
  await expect(page.locator('.driver-query-detail')).toContainText('验收司机甲')
  await expect(page.getByText('编辑司机')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('缺少综合查询权限时司机姓名只显示文本', async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    return route.fulfill({
      json:
        endpoint === 'tms_list_drivers_secure'
          ? { records: [driver], total: 1, fieldAccess: {} }
          : null
    })
  })
  await page.goto('/tests/e2e/fixtures/tms-mainline-visual.html?page=driver-roster&limited', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByText('验收司机甲')).toBeVisible({ timeout: 120_000 })
  await expect(page.getByRole('link', { name: '验收司机甲' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '编辑' })).toHaveCount(0)
})
