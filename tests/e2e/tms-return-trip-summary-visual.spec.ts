import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const summary = {
  waybillId: '00000000-0000-4000-a000-000000000011',
  waybillNo: 'YD202611-018',
  forwardRevenue: 1800,
  returnRevenue: 950,
  tripPlannedRevenue: 2750,
  returnDirectPlannedExpense: 240,
  sharedApprovedToll: 120,
  returnAllocatedToll: 60,
  returnPlannedCommission: 80,
  returnProjectedGrossProfit: 570,
  returnProjectedMargin: 60,
  returnActualRevenue: 950,
  returnActualCost: 380,
  returnActualGrossProfit: 570,
  actualAccountingStatus: 'approved_to_date',
  forwardCommissionEstimate: { matched: true, amount: 110 },
  returnCommissionEstimate: { matched: true, amount: 80 },
  accountingStatus: 'planned_only'
}

async function openSummary(
  page: import('@playwright/test').Page,
  hasReturnLeg: boolean,
  holdSummary = false
) {
  await prepareIsolatedSession(page)
  const pageErrors: string[] = []
  let releaseSummary = () => undefined
  const summaryReady = new Promise<void>((resolve) => {
    releaseSummary = resolve
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/rest/v1/rpc/tms_list_return_trip_candidates_secure', (route) =>
    route.fulfill({
      json: hasReturnLeg
        ? [{ id: summary.waybillId, waybillNo: summary.waybillNo, hasReturnLeg: true }]
        : []
    })
  )
  await page.route('**/rest/v1/rpc/tms_get_return_trip_summary_secure', async (route) => {
    if (holdSummary) await summaryReady
    await route.fulfill({ json: summary })
  })
  await page.goto('/tests/e2e/fixtures/tms-return-trip-summary.html', {
    waitUntil: 'domcontentloaded'
  })
  const dialog = page.locator('.art-dialog:visible')
  await expect(dialog.getByText('返程收益预估', { exact: true })).toBeVisible()
  return { dialog, pageErrors, releaseSummary }
}

test('返程收益弹窗展示加载、结果和成本明细且窄屏无横向溢出', async ({ page }) => {
  const { dialog, pageErrors, releaseSummary } = await openSummary(page, true, true)
  await expect(dialog.getByText('ORD-RETURN-SUMMARY-001')).toBeVisible()
  await expect(dialog.getByText('主运输任务 YD202611-018')).toBeVisible()
  await expect(dialog.locator('.art-section-card').first()).toHaveAttribute('aria-busy', 'true')
  releaseSummary()
  await expect(dialog.getByText('本趟合计预计收入')).toBeVisible()
  await expect(dialog.getByText('¥2,750.00')).toBeVisible()

  await dialog.getByRole('tab', { name: '预计成本分解' }).click()
  await expect(dialog.getByText('返程司机最终提成预估（计入毛利）')).toBeVisible()
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle('dark', value === 'dark'),
      theme
    )
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1)
      await dialog.screenshot({
        path: `.artifacts/visual-return-summary/summary-${width}-${theme}.png`,
        animations: 'disabled'
      })
    }
  }
  const explanation = dialog.getByText(
    '预计值与财务已审核值分开展示；返程专属费用只有提交并审核后才进入实际成本。'
  )
  await explanation.scrollIntoViewIfNeeded()
  await expect(explanation).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('无返程记录时展示可理解的空态', async ({ page }) => {
  const { dialog, pageErrors } = await openSummary(page, false)
  await expect(dialog.getByText('暂无返程配货记录')).toBeVisible()
  await expect(dialog.getByText('暂无关联主运输任务')).toBeVisible()
  expect(pageErrors).toEqual([])
})
