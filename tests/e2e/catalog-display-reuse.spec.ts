import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const dark of [false, true]) {
  for (const shadow of [false, true]) {
    test(`目录日期属性复用 dark=${dark} shadow=${shadow}`, async ({ page }, info) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
      await page.goto('/tests/e2e/fixtures/bom-process-retry.html')
      await page.evaluate(
        ({ dark, shadow }) => {
          document.documentElement.classList.toggle('dark', dark)
          document.documentElement.style.setProperty('--custom-radius', '0.5rem')
          document.documentElement.dataset.boxMode = shadow ? 'shadow-mode' : 'border-mode'
        },
        { dark, shadow }
      )
      await page.getByRole('button', { name: '打开目录验收' }).click()
      const drawer = page.getByRole('dialog')
      await expect(drawer).toContainText('2026-10-08 08:30:59')
      await expect(drawer).not.toContainText('invalid')
      const attributes = drawer.locator('.mdm-catalog-detail__attributes')
      await expect(attributes.locator('.art-descriptions__value').nth(0)).toHaveText('0')
      await expect(attributes.locator('.art-descriptions__value').nth(1)).toHaveText('否')
      await expect(drawer).toContainText('关键资料已完整')
      await page.screenshot({ path: info.outputPath('catalog-initial.png'), fullPage: true })
      await drawer.locator('.art-drawer__scrollbar .el-scrollbar__wrap').evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
      await expect(drawer).toBeInViewport()
      await expect(attributes).toBeInViewport()
      expect(
        await attributes.locator('.el-descriptions__label').evaluateAll((labels) =>
          labels.every((label) => {
            const range = document.createRange()
            range.selectNodeContents(label)
            return range.getClientRects().length <= 1
          })
        )
      ).toBe(true)
      await page.screenshot({ path: info.outputPath('catalog-attributes.png'), fullPage: true })
      expect(
        await drawer.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
      ).toBe(true)
      expect(errors).toEqual([])
    })
  }
}
