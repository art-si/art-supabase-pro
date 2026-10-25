import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('跨模块表格身份统一主次文本、图标色调和完整标题', async ({ page }, testInfo) => {
  const dark = testInfo.project.name.includes('dark')
  const boxMode = testInfo.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
  await page.addInitScript(
    ({ dark, boxMode }) => {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          document.documentElement.classList.toggle('dark', dark)
          document.documentElement.dataset.boxMode = boxMode
        },
        { once: true }
      )
    },
    { dark, boxMode }
  )
  await page.goto('/tests/e2e/fixtures/table-identity-reuse.html')

  const cells = page.locator('.business-table-identity-cell')
  await expect(cells).toHaveCount(3)
  await expect(cells.first().locator('strong')).toHaveAttribute(
    'title',
    '华东制造中心 · 总装与检测协同产线'
  )
  await expect(cells.first().locator('small')).toHaveAttribute(
    'title',
    '生产制造 / 华东工厂 / 总装车间'
  )
  await expect(cells.nth(1)).toHaveClass(/is-success/)
  await expect(cells.nth(2)).toHaveClass(/is-danger/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({
    path: testInfo.outputPath('identity-cells.png'),
    animations: 'disabled',
    fullPage: true
  })
})
