import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const scenario of ['storage', 'popup'] as const) {
  test(`附件预览${scenario === 'storage' ? '存储失败' : '弹窗被拦截'}提供一次提示且可重试`, async ({
    page
  }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/tests/e2e/fixtures/attachment-preview-feedback.html')
    const link = page.getByRole('link', { name: '验收凭证.pdf' })
    await expect(link).toBeVisible({ timeout: 60_000 })
    await page.evaluate((mode) => {
      if (mode === 'storage') {
        Storage.prototype.setItem = () => {
          throw new DOMException('Storage denied', 'SecurityError')
        }
      } else {
        window.open = () => null
      }
    }, scenario)
    await link.click()
    const message = page.locator('.el-message')
    await expect(message).toHaveCount(1)
    await expect(message).toContainText(
      scenario === 'storage' ? '无法保存预览信息' : '浏览器阻止了新页签'
    )
    await page.screenshot({
      path: testInfo.outputPath(`preview-${scenario}-feedback.png`),
      animations: 'disabled'
    })
    expect(errors).toEqual([])
    await page.reload()
    await expect(link).toBeVisible({ timeout: 60_000 })
    await page.evaluate(() => {
      window.open = (url) => {
        document.body.dataset.previewUrl = String(url)
        return window
      }
    })
    await link.click()
    await expect(page.locator('body')).toHaveAttribute('data-preview-url', /file-preview\?key=/)
    await expect(page.locator('.el-message')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}
