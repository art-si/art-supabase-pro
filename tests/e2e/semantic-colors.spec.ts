import { expect, test } from '@playwright/test'
import { contrast } from './text-contrast'

test.use({ storageState: { cookies: [], origins: [] } })

test('公共语义颜色在两种主题及容器模式下可读', async ({ page }, info) => {
  test.setTimeout(120_000)
  await page.goto('/tests/e2e/fixtures/semantic-colors.html')
  await expect(page.getByRole('region', { name: 'success', exact: true })).toBeVisible({
    timeout: 60_000
  })
  for (const theme of ['light', 'dark']) {
    for (const box of ['border-mode', 'shadow-mode']) {
      await page.evaluate(
        ({ theme, box }) => {
          document.documentElement.classList.toggle('dark', theme === 'dark')
          document.documentElement.dataset.boxMode = box
        },
        { theme, box }
      )
      for (const type of ['success', 'warning', 'danger', 'info']) {
        const tagColor = await page
          .locator(`.el-tag--${type}.el-tag--plain`)
          .evaluate((element) => getComputedStyle(element).color)
        await expect(page.getByText(`${type} 公共文本颜色`, { exact: true })).toHaveCSS(
          'color',
          tagColor
        )
      }
      const errorColor = await page
        .locator('.el-alert--error.is-light .el-alert__title')
        .evaluate((element) => getComputedStyle(element).color)
      await expect(page.getByText('error 公共文本颜色', { exact: true })).toHaveCSS(
        'color',
        errorColor
      )
      const text = page.locator(
        '.el-tag, .el-button, .el-alert__title, .el-alert__description, .semantic-token-text'
      )
      for (const element of await text.all()) {
        expect(
          await contrast(element),
          `${theme}: ${await element.textContent()}`
        ).toBeGreaterThanOrEqual(4.5)
      }
      if (!info.project.use.isMobile) {
        for (const button of await page.locator('.el-button').all()) {
          await button.hover()
          await page.waitForTimeout(150)
          expect(
            await contrast(button),
            `${theme} hover: ${await button.textContent()}`
          ).toBeGreaterThanOrEqual(4.5)
        }
      }
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1)
      await page.screenshot({ path: info.outputPath(`${theme}-${box}.png`), fullPage: true })
    }
  }
})
