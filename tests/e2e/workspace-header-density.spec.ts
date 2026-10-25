import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
for (const theme of ['light', 'dark'])
  for (const box of ['border-mode', 'shadow-mode']) {
    test(`共享概览小屏 ${theme} ${box}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 390, height: 844 })
      for (const density of ['default', 'compact'])
        for (const count of [1, 3, 4, 5]) {
          await page.goto(
            `/tests/e2e/fixtures/workspace-header-density.html?theme=${theme}&box=${box}&count=${count}&density=${density}`
          )
          await expect(page.locator('html')).toHaveAttribute('data-box-mode', box)
          await expect(page.locator('html')).toHaveClass(
            theme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/
          )
          const metrics = page.locator('.business-workspace-header__metric')
          await expect(metrics).toHaveCount(count)
          const first = metrics.first()
          await expect(first).toHaveAttribute('aria-pressed', 'true')
          await expect(first.locator('strong')).toHaveAttribute('title', '¥123,456,789,012.34')
          await first.focus()
          await page.keyboard.press('Enter')
          await expect(page.locator('output')).toHaveText('当期累计待结算业务总金额')
          if (count > 1) await expect(metrics.nth(1)).toBeDisabled()
          const bounds = await metrics.evaluateAll((items) =>
            items.map((item) => {
              const rect = item.getBoundingClientRect()
              return { x: rect.x, y: rect.y, width: rect.width }
            })
          )
          if (count > 1) {
            expect(bounds[0].y).toBe(bounds[1].y)
            expect(bounds[1].x).toBeGreaterThan(bounds[0].x)
            expect(bounds[2].y).toBeGreaterThan(bounds[0].y)
          }
          const size = await page.evaluate(() => ({
            width: document.documentElement.clientWidth,
            content: document.documentElement.scrollWidth
          }))
          expect(size.content).toBeLessThanOrEqual(size.width + 1)
          await page.screenshot({
            path: testInfo.outputPath(`${density}-${count}.png`),
            animations: 'disabled'
          })
        }
      await page.setViewportSize({ width: 320, height: 640 })
      await expect(page.locator('.business-workspace-header__metric')).toHaveCount(5)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        321
      )
      await page.screenshot({ path: testInfo.outputPath('narrow-320.png'), animations: 'disabled' })
      await page.setViewportSize({ width: 1440, height: 900 })
      const desktopRows = await page
        .locator('.business-workspace-header__metric')
        .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().y))
      expect(desktopRows.every((y) => y === desktopRows[0])).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('desktop.png'), animations: 'disabled' })
    })
  }
