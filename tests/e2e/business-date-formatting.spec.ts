import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(240_000)

test('车辆档案和运输回单复用日期格式且保留业务空值规则', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.text().includes('Failed to resolve component')) errors.push(message.text())
  })
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/business-date-formatting.html')
  const vehicle = page.locator('.vehicle-query-summary')
  const invoice = vehicle
    .locator('td')
    .filter({ hasText: '购入开票日期' })
    .locator('xpath=following-sibling::td[1]')
    .locator('.art-descriptions__value')
    .first()
  const arrival = page
    .locator('.receipt-ocr__context > span')
    .filter({ hasText: '计划到达' })
    .locator('strong')
  await expect(invoice).toHaveText('2026-10-09', { timeout: 120_000 })
  await expect(arrival).toHaveText('2026-10-09 12:34')
  await expect(vehicle).toContainText('12,345.6公里')
  await expect(
    vehicle
      .getByRole('cell', { name: '运营时长', exact: true })
      .locator('xpath=following-sibling::td[1]')
      .locator('.art-descriptions__value')
  ).toHaveText('--')
  for (let stage = 1; stage <= 3; stage++) {
    await page.getByRole('button', { name: '切换日期样本' }).click()
    await expect(invoice).toHaveText('--')
    await expect(arrival).toHaveText('未识别')
  }
  await page.getByRole('button', { name: '切换日期样本' }).click()
  await expect(invoice).toHaveText('2026-10-09')
  await expect(arrival).toHaveText('2026-10-09 12:34')
  await vehicle.screenshot({ path: info.outputPath('vehicle-summary.png') })
  await page.locator('.receipt-ocr').screenshot({ path: info.outputPath('receipt-context.png') })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
