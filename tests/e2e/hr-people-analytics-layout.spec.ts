import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)
test('人力分析空态工作区撑满页面，筛选条件保留可操作', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({ json: { as_of_date: '2026-10-07', period_start_date: '2025-10-08' } })
  )
  await page.goto('/tests/e2e/fixtures/hr-talent-inventory.html?page=analytics')
  const workspace = page.locator('.people-analytics-page__empty')
  await expect(workspace.getByText('当前截止日没有生效任职', { exact: true })).toBeVisible()
  expect(await workspace.evaluate((element) => element.getBoundingClientRect().bottom)).toBeCloseTo(
    780,
    0
  )
  await expect(page.getByRole('combobox', { name: '观察周期' })).toBeEnabled()
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({
    path: testInfo.outputPath('people-analytics-empty.png'),
    animations: 'disabled'
  })
})
