import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(90_000)
for (const theme of ['light', 'dark'])
  for (const box of ['border-mode', 'shadow-mode']) {
    test(`上传来源标签 ${theme} ${box}`, async ({ page }, info) => {
      await prepareIsolatedSession(page)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
      await page.goto(`/tests/e2e/fixtures/upload-source-label.html?theme=${theme}&box=${box}`)
      const normal = page.locator('[data-mode="normal"]')
      const toggle = normal.locator('.art-upload-file__source-toggle')
      await expect(toggle).toHaveAccessibleName('更多附件来源')
      expect(
        await toggle.evaluate((element) => {
          const main = element
            .closest('.art-upload-file__controls')!
            .querySelector('.art-upload-file__trigger')!
          return Math.abs(element.getBoundingClientRect().left - main.getBoundingClientRect().right)
        })
      ).toBeLessThanOrEqual(1)

      await expect(normal.getByText('选择附件', { exact: true })).toBeVisible()
      expect(
        await toggle.evaluate((element) => {
          const main = element
            .closest('.art-upload-file__controls')!
            .querySelector('.art-upload-file__trigger')!
          const left = main.getBoundingClientRect(),
            right = element.getBoundingClientRect()
          return Math.max(Math.abs(left.top - right.top), Math.abs(left.bottom - right.bottom))
        })
      ).toBeLessThanOrEqual(0.5)

      await toggle.click()
      await expect(page.getByRole('menuitem', { name: '从资源库选择' })).toBeVisible()
      await expect(
        page.getByRole('menuitem', { name: '从资源库选择' }).locator('.art-svg-icon')
      ).toHaveCount(1)

      expect(
        await page.getByRole('menuitem', { name: '从资源库选择' }).evaluate((element) => {
          const icon = element.querySelector('.art-svg-icon')!.getBoundingClientRect()
          const text = element.querySelector('span span')!.getBoundingClientRect()
          return {
            gap: text.left - icon.right,
            center: Math.abs((text.top + text.bottom) / 2 - (icon.top + icon.bottom) / 2)
          }
        })
      ).toEqual({ gap: 8, center: 0 })
      await page.screenshot({ path: info.outputPath('source-menu.png') })
      await page.keyboard.press('Escape')
      expect(
        await normal
          .locator('.art-upload-file')
          .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
      ).toBe(true)
      await expect(
        page.locator('[data-mode="disabled"] .art-upload-file__source-toggle')
      ).toHaveCount(0)
      await expect(
        page
          .locator('[data-mode="disabled"]')
          .getByRole('button', { name: '选择附件', exact: true })
      ).toBeDisabled()
      await expect(
        page.locator('[data-mode="readonly"] .art-upload-file__source-toggle')
      ).toHaveCount(0)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBe(true)
      expect(errors).toEqual([])
      await page.screenshot({ path: info.outputPath('sources.png'), fullPage: true })
    })
  }
