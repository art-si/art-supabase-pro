import { expect, test } from '@playwright/test'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('file preview renders an image and an expired-link state', async ({ page }, testInfo) => {
  const pageErrors: string[] = []
  const fullPresetRequests: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('request', (request) => {
    if (request.url().includes('@file-viewer/preset-all')) fullPresetRequests.push(request.url())
  })

  await page.route('**/file-preview-test.txt', (route) =>
    route.fulfill({ contentType: 'text/plain; charset=utf-8', body: '文件预览按需加载验证' })
  )

  await page.addInitScript(() => {
    const invalidFile = {
      url: new URL('file-preview-test.txt', location.href).href,
      fileType: 'txt'
    }
    for (const [key, value] of Object.entries({
      expired: JSON.stringify({ file: invalidFile, expiresAt: Date.now() - 1 }),
      malformed: 'invalid-json',
      'missing-expiry': JSON.stringify({ file: invalidFile }),
      'invalid-file-type': JSON.stringify({
        file: { ...invalidFile, fileType: {} },
        expiresAt: Date.now() + 60_000
      })
    })) {
      localStorage.setItem(`art-file-preview:${key}`, value)
    }
    localStorage.setItem(
      'art-file-preview:sample-image',
      JSON.stringify({
        file: {
          url: new URL('data/equipment-accessory-demo/safety-valve-photo.png', location.href).href,
          name: '安全阀照片.png',
          fileType: 'png'
        },
        expiresAt: Date.now() + 60_000
      })
    )
    localStorage.setItem(
      'art-file-preview:sample-text',
      JSON.stringify({
        file: {
          url: new URL('file-preview-test.txt', location.href).href,
          name: '预览测试.txt',
          fileType: 'txt'
        },
        expiresAt: Date.now() + 60_000
      })
    )
  })

  await page.goto('#/file-preview?key=sample-image', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.art-file-viewer-page__title strong')).toHaveText('安全阀照片.png', {
    timeout: 60_000
  })
  await expect(page.locator('.art-file-viewer-page__body img').first()).toBeVisible()
  await expect(page.locator('.art-file-viewer-page__body')).not.toContainText('无法打开文件预览')
  expect(fullPresetRequests).toHaveLength(0)
  await page.screenshot({ path: testInfo.outputPath('file-preview.png') })

  await page.goto('#/file-preview?key=sample-text', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.art-file-viewer-page__body')).toContainText('文件预览按需加载验证')

  for (const key of ['expired', 'malformed', 'missing-expiry', 'invalid-file-type']) {
    await page.goto(`#/file-preview?key=${key}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('无法打开文件预览')).toBeVisible()
    await expect(page.getByText('预览地址不存在或已过期，请从附件名称重新打开')).toBeVisible()
    expect(
      await page.evaluate((key) => localStorage.getItem(`art-file-preview:${key}`), key)
    ).toBeNull()
  }
  expect(pageErrors).toEqual([])
})

for (const theme of ['dark', 'light'] as const) {
  test(`file preview follows application theme ${theme} against system preference`, async ({
    page
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme === 'dark' ? 'light' : 'dark' })
    await prepareAppearance(page, { theme, boxBorderMode: theme === 'dark' })
    await page.addInitScript(() => {
      localStorage.setItem(
        'art-file-preview:theme-image',
        JSON.stringify({
          file: {
            url: new URL('data/equipment-accessory-demo/safety-valve-photo.png', location.href)
              .href,
            name: '主题验证.png',
            fileType: 'png'
          },
          expiresAt: Date.now() + 60_000
        })
      )
    })
    await page.goto('#/file-preview?key=theme-image', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.art-file-viewer-page__body img').first()).toBeVisible({
      timeout: 60_000
    })
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
    else await expect(page.locator('html')).not.toHaveClass(/dark/)
    await expect(page.locator('.file-viewer[data-viewer-theme]').first()).toHaveAttribute(
      'data-viewer-theme',
      theme
    )
    await page.screenshot({ path: testInfo.outputPath(`file-preview-${theme}.png`) })
  })
}
