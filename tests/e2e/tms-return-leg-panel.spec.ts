import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const summary = {
  waybillId: '00000000-0000-4000-a000-000000000011',
  waybillNo: 'YD202611-018-01',
  forwardWaybillId: '00000000-0000-4000-a000-000000000011',
  forwardWaybillNo: 'YD202611-018-01',
  forwardOriginStation: '上海',
  forwardDestinationStation: '杭州',
  forwardRevenue: 1800,
  tripPlannedRevenue: 2750,
  tripActualRevenue: 2750,
  tripActualCost: 1380,
  tripActualGrossProfit: 1370,
  actualAccountingStatus: 'approved_to_date',
  returns: [
    {
      waybillId: '00000000-0000-4000-a000-000000000012',
      waybillNo: 'YD202611-018-R01',
      legId: '00000000-0000-4000-a000-000000000022',
      dispatchType: 'return_load',
      sequence: 1,
      returnCustomerName: '返程客户甲',
      originStation: '杭州',
      destinationStation: '上海',
      plannedRevenue: 950,
      directPlannedExpense: 240,
      allocatedSharedToll: 30,
      plannedCommission: 80,
      projectedGrossProfit: 600
    },
    {
      waybillId: '00000000-0000-4000-a000-000000000013',
      waybillNo: 'YD202611-018-R02',
      legId: null,
      dispatchType: 'return_empty',
      sequence: 2,
      returnCustomerName: null,
      originStation: '上海',
      destinationStation: '苏州',
      plannedRevenue: 0,
      directPlannedExpense: 0,
      allocatedSharedToll: 15,
      plannedCommission: 0,
      projectedGrossProfit: -15
    }
  ]
}

async function openPanel(page: Page, response: object = summary) {
  await prepareIsolatedSession(page)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/rest/v1/rpc/tms_get_return_trip_summary_secure', (route) =>
    route.fulfill({ json: response })
  )
  await page.goto('/tests/e2e/fixtures/tms-return-trip-summary.html?panel=true', {
    waitUntil: 'domcontentloaded'
  })
  return { panel: page.locator('.art-section-card').first(), pageErrors }
}

test('详情面板展示同一正向单的配载与空载返程及整趟收益', async ({ page }, info) => {
  const { panel, pageErrors } = await openPanel(page)
  await expect(panel.getByText('YD202611-018-01', { exact: true })).toBeVisible()
  await expect(panel.getByText('YD202611-018-R01', { exact: true })).toBeVisible()
  await expect(panel.getByText('YD202611-018-R02', { exact: true })).toBeVisible()
  await expect(panel.getByText('返程配载', { exact: true })).toBeVisible()
  await expect(panel.getByText('返程空载', { exact: true })).toBeVisible()
  await expect(panel.getByText('¥2,750.00', { exact: true })).toHaveCount(2)
  await expect(panel.getByText('¥1,370.00', { exact: true })).toBeVisible()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1)
    await panel.screenshot({
      path: info.outputPath(`return-leg-panel-${width}.png`),
      animations: 'disabled'
    })
  }
  expect(pageErrors).toEqual([])
})

test('详情面板空态与加载失败后重试', async ({ page }) => {
  const { panel, pageErrors } = await openPanel(page, { ...summary, returns: [] })
  await expect(panel.getByText('本趟暂无返程调度运单')).toBeVisible()
  await page.route('**/rest/v1/rpc/tms_get_return_trip_summary_secure', (route) =>
    route.fulfill({ status: 503, json: { message: '服务暂时不可用' } })
  )
  await page.reload()
  await expect(panel.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
  await page.route('**/rest/v1/rpc/tms_get_return_trip_summary_secure', (route) =>
    route.fulfill({ json: summary })
  )
  await panel.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(panel.getByText('YD202611-018-R02', { exact: true })).toBeVisible()
  expect(pageErrors).toEqual([])
})
