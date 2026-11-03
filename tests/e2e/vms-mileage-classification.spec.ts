import { expect, test, type Page } from '@playwright/test'
import { installDictionaryOptions } from './support/dictionary-options'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(180_000)
const fixture = '/tests/e2e/fixtures/vms-operations-optimization.html?kind=mileage'
const records = [
  {
    id: 'mileage-1',
    vehicleId: 'vehicle-1',
    plateNo: '测A·10001',
    companyName: '验收运输公司',
    vehicleOwnership: 'carrier',
    driverName: '验收司机',
    driverPhone: '138****0001',
    carrierName: '验收承运商',
    waybillNo: 'YD2026001',
    vehicleType: 'semi_trailer',
    startTime: '2026-11-01T08:00:00+08:00',
    endTime: '2026-11-01T12:00:00+08:00',
    startMileage: 10000,
    endMileage: 10180,
    runningMileage: 180,
    fieldAccess: { tripTimeline: 'read', mileageValues: 'read' }
  },
  {
    id: 'mileage-2',
    vehicleId: 'vehicle-2',
    plateNo: '测A·10002',
    companyName: '验收运输公司',
    vehicleOwnership: 'self_operated',
    driverName: '验收司机二',
    driverPhone: null,
    carrierName: null,
    waybillNo: 'YD2026002',
    vehicleType: 'flatbed',
    startTime: '2026-11-02T08:00:00+08:00',
    endTime: null,
    startMileage: 20000,
    endMileage: null,
    runningMileage: 0,
    fieldAccess: { tripTimeline: 'read', mileageValues: 'read' }
  }
]
const setup = async (page: Page, state: { fail?: boolean; empty?: boolean } = {}) => {
  const requests: Array<Record<string, unknown>> = []
  const unexpected: string[] = []
  page.on('pageerror', (error) => unexpected.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    unexpected.push(route.request().url())
    return route.fulfill({ status: 400, json: { message: 'unexpected test request' } })
  })
  await installDictionaryOptions(page, {
    vehicleOwnership: [
      { value: 'carrier', label: '承运商' },
      { value: 'self_operated', label: '自营' }
    ],
    vehicleType: [
      { value: 'semi_trailer', label: '半挂车' },
      { value: 'flatbed', label: '平板车' }
    ]
  })
  await page.route('**/rest/v1/rpc/get_table_column_runtime', (route) =>
    route.fulfill({ json: { enabled: false, profiles: [] } })
  )
  await page.route('**/rest/v1/rpc/vms_list_vehicle_archive_navigation_secure', (route) =>
    route.fulfill({
      json: records.map((row) => ({
        id: row.vehicleId,
        vehicleOwnership: row.vehicleOwnership,
        vehicleType: row.vehicleType
      }))
    })
  )
  await page.route('**/rest/v1/rpc/vms_list_vehicle_mileage_secure', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    requests.push(body)
    if (state.fail)
      return route.fulfill({ status: 503, json: { code: 'XX000', message: 'test unavailable' } })
    const rows = state.empty
      ? []
      : records.filter(
          (row) =>
            (!body.p_vehicle_ownership || row.vehicleOwnership === body.p_vehicle_ownership) &&
            (!body.p_vehicle_type || row.vehicleType === body.p_vehicle_type)
        )
    return route.fulfill({
      json: {
        records: rows,
        total: rows.length,
        fieldAccess: { tripTimeline: 'read', mileageValues: 'read' }
      }
    })
  })
  return { requests, unexpected }
}

test('归属和车型级联、计数、司机电话与专注模式', async ({ page }, testInfo) => {
  const { requests, unexpected } = await setup(page)
  await page.goto(fixture)
  await expect(page.getByRole('columnheader', { name: '车辆归属', exact: true })).toBeVisible()
  await expect(page.getByText('验收司机 / 138****0001', { exact: true })).toBeVisible()
  const navigation = page.locator('.vehicle-classification-panel')
  await expect(navigation.getByText('2 辆车', { exact: true })).toBeVisible({ timeout: 60_000 })
  await navigation.locator('.el-tree-node__content').filter({ hasText: '承运商' }).first().click()
  await expect.poll(() => requests.at(-1)?.p_vehicle_ownership).toBe('carrier')
  await expect(page.getByText('测A·10002', { exact: true })).toHaveCount(0)
  await navigation.getByText('半挂车', { exact: true }).click()
  await expect.poll(() => requests.at(-1)?.p_vehicle_type).toBe('semi_trailer')
  await navigation.getByRole('textbox', { name: '搜索车辆分类' }).fill('半挂车')
  await expect(navigation.getByText('半挂车', { exact: true })).toBeVisible()
  await navigation.getByRole('textbox', { name: '搜索车辆分类' }).fill('')
  await navigation.getByRole('button', { name: /全部车辆/ }).click()
  await expect(page.getByText('测A·10002', { exact: true })).toBeVisible()
  await page
    .locator('.business-table-workspace-actions__toggle')
    .filter({ hasText: '专注模式' })
    .locator('.el-switch')
    .click()
  await expect(page.locator('.business-workspace-header')).toBeHidden()
  await expect(navigation).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '车牌号', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
  await expect(page.locator('.business-workspace-header')).toBeVisible()
  await page
    .locator('.business-table-workspace-actions__toggle')
    .filter({ hasText: '专注模式' })
    .locator('.el-switch')
    .click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.business-workspace-header')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('mileage-classified.png'), fullPage: true })
  expect(unexpected).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
})

test('失败可重试并保留分类，空列表与窄屏无页面横向溢出', async ({ page }, testInfo) => {
  const state = { fail: true, empty: false }
  const { unexpected } = await setup(page, state)
  await page.goto(fixture)
  await expect(page.getByRole('button', { name: '重新加载' })).toBeVisible()
  await expect(page.locator('.vehicle-classification-panel')).toBeVisible()
  state.fail = false
  state.empty = true
  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(page.getByText('暂无车辆里程记录', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 800, height: 900 })
  await expect(page.locator('.vehicle-classification-panel')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('mileage-empty-narrow.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  expect(unexpected).toEqual([])
})
