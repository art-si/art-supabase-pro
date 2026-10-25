import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)
for (const mode of ['team', 'equipment', 'inspection', 'inspection-coverage']) {
  test(`安全报表公共百分比 ${mode}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.route('**/rest/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      const records = [12.34567, 0].map((rate, index) => ({
        organizationId: `org-${index}`,
        organizationName: `测试组织${index + 1}`,
        teamCount: 1,
        memberCount: 10,
        coveredMemberCount: 1,
        completedTaskCount: 1,
        coverageRate: rate,
        taskCompletionRate: rate,
        generatedCount: 10,
        missedCount: 1,
        missedPointCount: 1,
        missedExecutorCount: 1,
        repeatedMissedCount: 1,
        missedRate: rate,
        repeatRate: rate,
        inspectionRate: rate,
        equipmentCode: `TEST-${index}`,
        equipmentName: `测试设备${index + 1}`,
        categoryName: '测试类别',
        riskPointName: '测试风险点',
        riskLevelName: '低风险',
        riskItemCount: 1,
        measureCount: 1,
        taskCount: 10,
        hazardFactors: '测试因素',
        controlMeasures: '测试措施'
      }))
      const overview = {
        organizationCount: 2,
        teamCount: 2,
        memberCount: 20,
        coveredMemberCount: 2,
        completedTaskCount: 2,
        coverageRate: 10,
        equipmentCount: 2,
        riskPointCount: 2,
        highRiskPointCount: 0,
        riskItemCount: 2,
        measureCount: 2,
        taskCount: 20,
        generatedCount: 20,
        completedCount: 2,
        pendingCount: 18,
        missedCount: 2,
        repeatedMissedCount: 2,
        inspectionRate: 10,
        missedRate: 10
      }
      await route.fulfill({
        json: path.includes('/rpc/smis_get_')
          ? {
              overview,
              records,
              organizationStats:
                mode.startsWith('inspection') || mode === 'equipment' ? records : [],
              riskDetails: mode === 'equipment' ? records : [],
              organizationOptions: [],
              riskLevelOptions: [],
              categoryStats: [],
              cycleStats: [],
              riskLevelStats: []
            }
          : []
      })
    })
    await page.goto(`/tests/e2e/fixtures/smis-rate-reuse.html?mode=${mode}`)
    const table = page.locator('.el-table').last()
    await expect(table.locator('.el-table__body-wrapper tbody tr')).toHaveCount(2, {
      timeout: 120_000
    })
    // The rate columns can sit outside the initial horizontal table window on mobile.
    await expect(table).toContainText('12.35%')
    await expect(table).toContainText('0.00%')
    await expect(page.locator('.el-progress__text').filter({ hasText: '12.34567%' })).toHaveCount(0)
    await table.scrollIntoViewIfNeeded()
    await table
      .locator('.el-scrollbar__wrap')
      .first()
      .evaluate((element) => {
        element.scrollLeft = element.scrollWidth
      })
    if (mode !== 'equipment') {
      const title =
        mode === 'team' ? '涵盖率对比' : mode === 'inspection' ? '漏查率对比' : '排查率对比'
      const chart = page
        .locator('.art-section-card')
        .filter({ has: page.getByText(title, { exact: true }) })
      await chart.scrollIntoViewIfNeeded()
      await expect(chart.locator('canvas')).toBeVisible()
    }
    await page.screenshot({ path: info.outputPath('smis-rate-reuse.png'), fullPage: true })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
