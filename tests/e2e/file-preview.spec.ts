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
          url: new URL('/tests/e2e/fixtures/preview-safe.png', location.href).href,
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
            url: new URL('/tests/e2e/fixtures/preview-safe.png', location.href).href,
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

test('file preview 丢弃旧缓存危险地址并可读取相对与本源 Blob 图片', async ({ page }, info) => {
  const presetRequests: string[] = []
  const unsafeRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('@file-viewer/preset-all')) presetRequests.push(request.url())
    if (/^(javascript:|data:|file:|blob:https:\/\/foreign\.invalid)/.test(request.url()))
      unsafeRequests.push(request.url())
  })
  await page.addInitScript(() => {
    const expiresAt = Date.now() + 60_000
    const cache = (key: string, url: string) =>
      localStorage.setItem(
        `art-file-preview:${key}`,
        JSON.stringify({ file: { url, name: '旧预览.png', fileType: 'png' }, expiresAt })
      )
    for (const [key, url] of Object.entries({
      'unsafe-script': 'javascript:window.__unsafeExecuted=true',
      'unsafe-data': 'data:image/png;base64,aGVsbG8=',
      'unsafe-file': 'file:///private/legacy.png',
      'unsafe-mailto': 'mailto:test@example.invalid',
      'unsafe-foreign-blob': 'blob:https://foreign.invalid/12345678',
      'unsafe-anchor': '#blocked'
    }))
      cache(key, url)
    cache('safe-relative', '/tests/e2e/fixtures/preview-safe.png')
    const bytes = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5u0AAAAASUVORK5CYII='
      ),
      (character) => character.charCodeAt(0)
    )
    const blobUrl = URL.createObjectURL(new Blob([bytes.buffer], { type: 'image/png' }))
    sessionStorage.setItem('file-preview-fixture-blob', blobUrl)
    cache('safe-blob', blobUrl)
    const unnamedUrl = URL.createObjectURL(new Blob([bytes.buffer], { type: 'image/png' }))
    localStorage.setItem(
      'art-file-preview:safe-blob-unnamed',
      JSON.stringify({
        file: { url: unnamedUrl, name: '附件', fileType: 'image/png' },
        expiresAt
      })
    )
  })

  for (const key of [
    'unsafe-script',
    'unsafe-data',
    'unsafe-file',
    'unsafe-mailto',
    'unsafe-foreign-blob',
    'unsafe-anchor'
  ]) {
    await page.goto(`#/file-preview?key=${key}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('无法打开文件预览')).toBeVisible()
    await expect(page.getByText('预览地址不存在或已过期，请从附件名称重新打开')).toBeVisible()
    expect(
      await page.evaluate((name) => localStorage.getItem(`art-file-preview:${name}`), key)
    ).toBeNull()
    await expect(page.locator('.art-file-viewer-page__body img')).toHaveCount(0)
  }
  expect(presetRequests).toEqual([])
  expect(unsafeRequests).toEqual([])
  expect(
    await page.evaluate(() =>
      Boolean((window as Window & { __unsafeExecuted?: boolean }).__unsafeExecuted)
    )
  ).toBe(false)
  await page.screenshot({ path: info.outputPath('file-preview-unsafe-cache.png') })

  for (const key of ['safe-relative', 'safe-blob', 'safe-blob-unnamed']) {
    await page.goto(`#/file-preview?key=${key}`, { waitUntil: 'domcontentloaded' })
    if (key === 'safe-blob') {
      const blobResponse = await page.evaluate(async () => {
        const url = sessionStorage.getItem('file-preview-fixture-blob') || ''
        try {
          const response = await fetch(url)
          return {
            ok: response.ok,
            type: response.headers.get('content-type'),
            size: (await response.arrayBuffer()).byteLength
          }
        } catch (error) {
          return { ok: false, type: String(error), size: 0 }
        }
      })
      expect(blobResponse).toEqual({ ok: true, type: 'image/png', size: 68 })
    }
    const image = page.locator('.art-file-viewer-page__body img').first()
    await expect(image, `preview key: ${key}`).toBeVisible()
    await expect
      .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0)
  }
  const blobUrl = await page.evaluate(() => sessionStorage.getItem('file-preview-fixture-blob'))
  expect(blobUrl).toMatch(/^blob:http:\/\/127\.0\.0\.1:3006\//)
  await expect(page.locator('.art-file-viewer-page__title strong')).toHaveText('附件')
  expect(presetRequests).toEqual([])
  await page.screenshot({ path: info.outputPath('file-preview-safe-blob.png') })
})

test('本源 Blob 读取失败只呈现可重试错误，重试后真实图片恢复', async ({ page }, info) => {
  await page.setViewportSize({ width: 570, height: 900 })
  await prepareAppearance(page, { theme: 'dark', boxBorderMode: false })
  await page.addInitScript(() => {
    const bytes = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5u0AAAAASUVORK5CYII='
      ),
      (character) => character.charCodeAt(0)
    )
    const url = URL.createObjectURL(new Blob([bytes.buffer], { type: 'image/png' }))
    localStorage.setItem(
      'art-file-preview:blob-retry',
      JSON.stringify({
        file: { url, name: '重试图片.png', fileType: 'png' },
        expiresAt: Date.now() + 60_000
      })
    )
    const nativeFetch = window.fetch.bind(window)
    let attempts = 0
    window.fetch = (input, init) => {
      if (String(input).startsWith('blob:')) {
        attempts++
        sessionStorage.setItem('blob-retry-attempts', String(attempts))
        if (attempts === 1) return Promise.reject(new TypeError('fixture blob read failed'))
      }
      return nativeFetch(input, init)
    }
  })
  await page.goto('#/file-preview?key=blob-retry', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('无法打开文件预览')).toBeVisible()
  await expect(page.getByText('本地附件读取失败，请从附件名称重新打开后重试')).toBeVisible()
  await expect(page.getByRole('button', { name: '重新加载' })).toBeVisible()
  await expect(page.locator('.el-message')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('file-preview-blob-error-dark-570.png') })

  await page.getByRole('button', { name: '重新加载' }).click()
  const image = page.locator('.art-file-viewer-page__body img').first()
  await expect(image).toBeVisible()
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
  await expect(page.getByText('无法打开文件预览')).toHaveCount(0)
  expect(await page.evaluate(() => sessionStorage.getItem('blob-retry-attempts'))).toBe('2')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({ path: info.outputPath('file-preview-blob-recovered-dark-570.png') })
})

test('旧 Blob 请求晚于切换的预览结果不会覆盖当前图片', async ({ page }) => {
  await page.addInitScript(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    canvas.getContext('2d')?.fillRect(0, 0, 2, 2)
    const bytes = Uint8Array.from(
      atob(canvas.toDataURL('image/png').split(',')[1] || ''),
      (character) => character.charCodeAt(0)
    )
    const url = URL.createObjectURL(new Blob([bytes.buffer], { type: 'image/png' }))
    const expiresAt = Date.now() + 60_000
    localStorage.setItem(
      'art-file-preview:blob-stale',
      JSON.stringify({ file: { url, name: '旧图片.png', fileType: 'png' }, expiresAt })
    )
    localStorage.setItem(
      'art-file-preview:current-relative',
      JSON.stringify({
        file: {
          url: '/tests/e2e/fixtures/preview-safe.png',
          name: '当前图片.png',
          fileType: 'png'
        },
        expiresAt
      })
    )
    const nativeFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      if (!String(input).startsWith('blob:')) return nativeFetch(input, init)
      sessionStorage.setItem('stale-blob-started', '1')
      return new Promise<Response>((resolve, reject) => {
        ;(window as Window & { __releaseStaleBlob?: () => Promise<void> }).__releaseStaleBlob =
          async () => {
            sessionStorage.setItem('stale-blob-signal-aborted', String(init?.signal?.aborted))
            try {
              const response = await nativeFetch(input)
              const body = await response.arrayBuffer()
              resolve(new Response(body, { headers: { 'content-type': 'image/png' } }))
              await new Promise<void>((done) =>
                requestAnimationFrame(() => requestAnimationFrame(() => done()))
              )
              sessionStorage.setItem('stale-release-complete', '1')
            } catch (error) {
              reject(error)
            }
          }
      })
    }
  })
  await page.goto('#/file-preview?key=blob-stale', { waitUntil: 'domcontentloaded' })
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('stale-blob-started')))
    .toBe('1')
  await page.goto('#/file-preview?key=current-relative', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.art-file-viewer-page__title strong')).toHaveText('当前图片.png')
  const current = page.locator('.art-file-viewer-page__body img').first()
  await expect(current).toBeVisible()
  await expect
    .poll(() => current.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBe(1)
  await page.evaluate(() =>
    (window as Window & { __releaseStaleBlob?: () => Promise<void> }).__releaseStaleBlob?.()
  )
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('stale-release-complete')))
    .toBe('1')
  expect(await page.evaluate(() => sessionStorage.getItem('stale-blob-signal-aborted'))).toBe(
    'true'
  )
  await expect(page.locator('.art-file-viewer-page__title strong')).toHaveText('当前图片.png')
  await expect(page.getByText('无法打开文件预览')).toHaveCount(0)
  await expect(current).toBeVisible()
  await expect
    .poll(() => current.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBe(1)
})
