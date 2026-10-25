import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)
for (const feature of ['headcount', 'development']) {
  test(`${feature} 预算货币精度与空值零值保持业务口径`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const url = route.request().url()
      if (url.includes('hr_workforce_overview_secure'))
        return route.fulfill({
          json: {
            featured_plan: {
              id: 'featured',
              plan_no: 'FEATURED-EUR',
              plan_name: '重点预算验证',
              status: 'draft',
              currency_code: 'EUR',
              budget_amount: 1000,
              planned_payroll: 1234.5,
              budget_variance: -1.5,
              baseline_count: 4,
              planned_hires: 2,
              planned_exits: 1,
              target_count: 5
            }
          }
        })
      if (url.includes('hr_list_workforce_records_secure'))
        return route.fulfill({
          json: {
            records: [
              {
                id: 'budget',
                period_start: '2026-01-01',
                period_end: '2026-12-31',
                plan_name: '预算精度验证',
                plan_no: 'BUDGET-001',
                status: 'draft',
                currency_code: 'USD',
                budget_amount: 1234.5,
                planned_payroll: 0
              },
              {
                id: 'empty',
                period_start: '2026-01-01',
                period_end: '2026-12-31',
                plan_name: '空预算验证',
                plan_no: 'BUDGET-EMPTY',
                status: 'draft',
                currency_code: 'EUR',
                budget_amount: null,
                planned_payroll: null
              }
            ],
            total: 2
          }
        })
      if (url.includes('hr_list_learning_records_secure'))
        return route.fulfill({
          json: {
            records: [
              {
                id: 'learning',
                start_date: '2026-01-01',
                end_date: '2026-12-31',
                plan_name: '培训费用精度验证',
                plan_code: 'LEARN-001',
                status: 'draft',
                budget: 1234.5,
                actual_cost: 0
              },
              {
                id: 'empty',
                plan_name: '空费用验证',
                start_date: '2026-01-01',
                end_date: '2026-12-31',
                plan_code: 'LEARN-EMPTY',
                status: 'draft',
                budget: null,
                actual_cost: null
              }
            ],
            total: 2
          }
        })
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `/tests/e2e/fixtures/hr-all-pages.html?page=${feature === 'headcount' ? 'operations/headcount' : 'talent/development'}`
    )
    const identity = page
      .locator('.business-table-identity-cell')
      .filter({ hasText: feature === 'headcount' ? 'US$1,235' : '¥1,234.50' })
      .first()
    await expect(identity).toBeAttached({ timeout: 60_000 })
    await identity.scrollIntoViewIfNeeded()
    await expect(identity.locator('strong')).toHaveText(
      feature === 'headcount' ? 'US$1,235' : '¥1,234.50'
    )
    await expect(identity.locator('small')).toHaveText(
      feature === 'headcount' ? '预测 US$0' : '实际 ¥0.00'
    )
    if (feature === 'headcount') {
      await expect(page.locator('.workforce-page__bridge')).toContainText('€1,235')
      await expect(page.locator('.workforce-page__bridge')).toContainText('超预算 €2')
    }
    await expect(
      page
        .locator('.business-table-identity-cell')
        .filter({ hasText: feature === 'headcount' ? '预测 --' : '实际 --' })
        .first()
        .locator('strong')
    ).toHaveText('--')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    expect(errors).toEqual([])
    await expect(page.locator('.business-workspace-page')).not.toContainText('undefined')
    await page.screenshot({ path: info.outputPath(`${feature}.png`), fullPage: true })
  })
}
