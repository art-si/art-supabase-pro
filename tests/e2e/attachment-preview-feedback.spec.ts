import { readFile } from 'node:fs/promises'
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

for (const scenario of [
  { name: 'light-border-1440', width: 1440, theme: 'light', box: 'border-mode' },
  { name: 'dark-shadow-570', width: 570, theme: 'dark', box: 'shadow-mode' }
]) {
  test(`附件链接拒绝无效地址并保留安全预览 ${scenario.name}`, async ({ page }, info) => {
    await page.setViewportSize({ width: scenario.width, height: 900 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => route.abort('blockedbyclient'))
    await page.goto(
      `/tests/e2e/fixtures/attachment-preview-feedback.html?mode=boundary&theme=${scenario.theme}&box=${scenario.box}`,
      { waitUntil: 'domcontentloaded' }
    )
    await page.evaluate(() => {
      window.open = (url) => {
        document.body.dataset.previewUrl = String(url)
        document.body.dataset.previewCount = String(
          Number(document.body.dataset.previewCount || '0') + 1
        )
        return window
      }
    })
    for (const name of [
      '空地址',
      '井号地址',
      '脚本地址',
      '数据地址',
      '本地文件地址',
      '邮件地址',
      '异源 Blob 地址'
    ]) {
      const link = page.locator(`[data-file-name="${name}"] .art-attachment-link`)
      await expect(link).toHaveClass(/is-disabled/)
      await expect(link).not.toHaveAttribute('href', /.+/)
      await expect(link).toHaveAttribute('aria-disabled', 'true')
      await expect(link).toHaveAttribute('title', /附件地址不可用/)
      expect(await link.evaluate((element) => (element as HTMLElement).tabIndex)).toBe(-1)
      await link.focus()
      await page.keyboard.press('Enter')
    }
    await expect(page.locator('body')).not.toHaveAttribute('data-preview-count', /[1-9]/)
    await expect(page.locator('.el-message')).toHaveCount(0)
    expect(
      await page.evaluate(() =>
        Boolean((window as Window & { __unsafeExecuted?: boolean }).__unsafeExecuted)
      )
    ).toBe(false)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    const tabbedFiles: string[] = []
    for (let index = 0; index < 8; index++) {
      await page.keyboard.press('Tab')
      const name = await page.evaluate(() =>
        document.activeElement?.closest('[data-file-name]')?.getAttribute('data-file-name')
      )
      if (name) tabbedFiles.push(name)
    }
    expect(tabbedFiles).toContain('相对图片')
    expect(tabbedFiles).toContain('本源 Blob 图片')
    expect(tabbedFiles).not.toContain('脚本地址')
    expect(tabbedFiles).not.toContain('异源 Blob 地址')

    const relative = page.locator('[data-file-name="相对图片"] .art-attachment-link')
    await expect(relative).toHaveAttribute('href', /\/tests\/e2e\/fixtures\/preview-safe\.png$/)
    await relative.click()
    await expect(page.locator('body')).toHaveAttribute('data-preview-count', '1')
    const blobUrl = await page.getByTestId('same-origin-blob-url').textContent()
    expect(blobUrl).toMatch(/^blob:http:\/\/127\.0\.0\.1:3006\//)
    const blob = page.locator('[data-file-name="本源 Blob 图片"] .art-attachment-link')
    await expect(blob).toHaveAttribute('href', blobUrl!)
    await blob.click()
    await expect(page.locator('body')).toHaveAttribute('data-preview-count', '2')
    const cachedUrls = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('art-file-preview:'))
        .map((key) => JSON.parse(localStorage.getItem(key) || '{}').file?.url)
    )
    expect(cachedUrls).toContain(blobUrl)
    expect(
      cachedUrls.some((url) => String(url).endsWith('/tests/e2e/fixtures/preview-safe.png'))
    ).toBe(true)
    expect(errors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    await page.screenshot({
      path: info.outputPath(`attachment-boundary-${scenario.name}.png`),
      fullPage: true
    })
  })
}

test('直接下载仅接受 HTTP 与本源 Blob，拒绝地址只提示一次', async ({ page }, info) => {
  await page.route('**/rest/v1/**', (route) => route.abort('blockedbyclient'))
  await page.goto('/tests/e2e/fixtures/attachment-preview-feedback.html?mode=boundary')
  await page.getByRole('button', { name: '无效下载' }).click()
  await expect(page.locator('.el-message--warning')).toHaveCount(1)
  await expect(page.locator('.el-message--warning')).toContainText('附件地址不可用')

  const httpPending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'HTTP 下载' }).click()
  const httpDownload = await httpPending
  expect(httpDownload.suggestedFilename()).toBe('relative.txt')
  const httpPath = info.outputPath('relative.txt')
  await httpDownload.saveAs(httpPath)
  expect((await readFile(httpPath, 'utf8')).trim()).toBe('http download bytes')
  await page.evaluate(() => {
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.revokeObjectURL = (value) => {
      document.body.dataset.revokedUrl = value
      revoke(value)
    }
  })
  const blobPending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Blob 下载' }).click()
  const blobDownload = await blobPending
  expect(blobDownload.suggestedFilename()).toBe('blob.txt')
  const blobPath = info.outputPath('blob.txt')
  await blobDownload.saveAs(blobPath)
  expect(await readFile(blobPath, 'utf8')).toBe('blob download bytes')
  await expect(page.locator('body')).toHaveAttribute('data-revoked-url', /^blob:/)
  await expect(page.locator('a[download]')).toHaveCount(0)
})
