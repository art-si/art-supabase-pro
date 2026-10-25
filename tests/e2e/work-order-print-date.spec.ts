import { expect, test } from '@playwright/test'
test('工单每次打印刷新日期并使用公共数字格式', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-10T04:00:00Z') })
  await page.addInitScript(() => {
    window.print = () => {}
  })
  await page.goto('/tests/e2e/fixtures/work-order-print-date.html')
  await page.getByRole('button', { name: '打印工单' }).click()
  const sheet = page.locator('.work-order-print-sheet')
  await expect(sheet).toContainText('2026-10-10')
  await expect(sheet).toContainText('12,345.67')
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await expect(sheet).toHaveCount(0)
  await page.clock.setSystemTime(new Date('2026-10-11T04:00:00Z'))
  await page.getByRole('button', { name: '打印工单' }).click()
  await expect(sheet).toContainText('2026-10-11')
  await expect(sheet).not.toContainText('2026-10-10')
})
