import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('SMIS 基础资料编码统一语义标签与完整标题', async ({ page }, testInfo) => {
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
  await page.goto('/tests/e2e/fixtures/smis-code-tag.html')

  const tags = page.locator('.el-tag.el-tag--small.is-round')
  await expect(tags).toHaveCount(3)
  await expect(tags.first().locator('..')).toHaveAttribute('title', 'INSPECTION-CATEGORY-2026-001')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({
    path: testInfo.outputPath('code-tags.png'),
    animations: 'disabled',
    fullPage: true
  })
})
