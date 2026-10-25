import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

test('甘特排程实际任务数量使用分组和两位小数', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/mes-number-format.html')
  await expect(page.locator('.schedule-board__quantity').first()).toHaveText('1,234.57')
  await expect(page.locator('.schedule-board__quantity').nth(1)).toHaveText('0')
  const scroll = page.getByTestId('board-scroll')
  await scroll.evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await expect(page.locator('.schedule-board__quantity').last()).toHaveText('1,234.57')
  await scroll.evaluate((element) => {
    element.scrollLeft = 0
  })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('gantt-format.png'), animations: 'disabled' })
})

test('人力分析保留分组、小数和百分比显示', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      json: {
        as_of_date: '2026-10-09',
        period_start_date: '2025-10-10',
        period_months: 12,
        privacy_threshold: 5,
        generated_at: '2026-10-09T08:00:00Z',
        overview: {
          opening_headcount: 1250,
          ending_headcount: 1260,
          ending_fte: 1234.567,
          hires: 20,
          exits: 10,
          net_change: 10,
          turnover_rate: 1.2,
          average_tenure_years: 2.345,
          data_completeness_rate: 98.765
        },
        flow_trend: [],
        organization_distribution: [],
        employment_distribution: [],
        tenure_distribution: [],
        data_quality: []
      }
    })
  )
  await page.goto('/tests/e2e/fixtures/hr-talent-inventory.html?page=analytics')
  await expect(page.getByText('1,234.57 FTE', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('98.77%', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('平均任期 2.35 年', { exact: true })).toBeVisible()
  await expect(page.getByText('离职率 1.2%', { exact: true })).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({
    path: testInfo.outputPath('people-analytics-format.png'),
    fullPage: true,
    animations: 'disabled'
  })
})
