import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const kind of ['defect', 'event', 'mold'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`MES ${kind} 详情导语复用布局 ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(
        `/tests/e2e/fixtures/mes-production-detail-intro.html?kind=${kind}&theme=${theme}`,
        { waitUntil: 'domcontentloaded' }
      )
      const intro = page.locator('.mes-production-detail-intro')
      const icon = intro.locator('> span:first-child')
      await expect(intro).toBeVisible({ timeout: 60_000 })
      await expect(intro).toHaveCSS('display', 'flex')
      await expect(intro).toHaveCSS('gap', '12px')
      await expect(icon).toHaveCSS('width', '40px')
      await expect(icon).toHaveCSS('height', '40px')
      await expect(intro.locator('h3')).toBeVisible()
      await expect(intro.locator('p')).toHaveCSS('margin-top', '2px')
      await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true })

      await page.setViewportSize({ width: 390, height: 844 })
      await expect(intro).toBeVisible()
      await expect(icon).toHaveCSS('width', '40px')
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1)
      await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true })
    })
  }
}
