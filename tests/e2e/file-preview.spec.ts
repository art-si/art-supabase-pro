import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { readFile } from 'node:fs/promises'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('production PDF preview decodes JPEG 2000 without WebAssembly', async ({ context, page }) => {
  test.skip(process.env.E2E_FILE_VIEWER_PRODUCTION !== 'true', '需提供生产构建的 E2E_BASE_URL')
  const sample = await readFile(new URL('./fixtures/preview-jpx.pdf', import.meta.url))
  await context.route('**/openjpeg.wasm', (route) => route.abort('failed'))
  await page.route('**/preview-jpx.pdf', (route) =>
    route.fulfill({ contentType: 'application/pdf', body: sample })
  )
  await page.addInitScript(() => {
    localStorage.setItem(
      'art-file-preview:jpx-test',
      JSON.stringify({
        file: {
          url: new URL('preview-jpx.pdf', location.href).href,
          name: 'JPEG 2000 预览.pdf',
          fileType: 'pdf'
        },
        expiresAt: Date.now() + 120_000
      })
    )
  })
  const fallback = context.waitForEvent('response', {
    predicate: (response) => response.url().endsWith('/openjpeg_nowasm_fallback.js')
  })
  await page.goto('#/file-preview?key=jpx-test')
  expect((await fallback).ok()).toBe(true)

  // The sample has a red JPEG 2000 image centered in an otherwise white PDF page.
  const canvas = page.locator('.art-file-viewer-page__body canvas').first()
  await expect(canvas).toBeVisible()
  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error('预览未生成画布')
        const context = element.getContext('2d')
        const pixel = context?.getImageData(element.width / 2, element.height / 2, 1, 1)
        return Array.from(pixel?.data ?? [])
      })
    )
    .toEqual([220, 33, 45, 255])
})

test.describe('production spreadsheet preview', () => {
  test.skip(process.env.E2E_FILE_VIEWER_PRODUCTION !== 'true', '需提供生产构建的 E2E_BASE_URL')

  for (const workerFailure of [false, true]) {
    test(`显示大型 Excel 文件${workerFailure ? '并从 Worker 失败回退' : ''}`, async ({ page }) => {
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('测试产线')
      sheet.addRow(['Worker 回归样本', '状态'])
      for (let row = 1; row <= 2400; row += 1) {
        sheet.addRow([`测试零件 ${row} ${'样本数据'.repeat(32)}`, row])
      }
      const bytes = Buffer.from(await workbook.xlsx.writeBuffer({ zip: { compression: 'STORE' } }))
      // File Viewer uses a background worker at 1 MiB and above.
      expect(bytes.byteLength).toBeGreaterThan(1024 * 1024)
      await page.route('**/preview-test.xlsx', (route) =>
        route.fulfill({
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: bytes
        })
      )
      if (workerFailure) {
        await page.route('**/vendor/xlsx/sheet.worker.js', (route) => route.abort('failed'))
      }
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.addInitScript(() => {
        window.Worker = class extends Worker {
          constructor(url: string | URL, options?: WorkerOptions) {
            super(url, options)
            if (String(url).endsWith('/vendor/xlsx/sheet.worker.js')) {
              this.addEventListener('message', ({ data }) => {
                if (data?.type === 'sheets') document.documentElement.dataset.sheetWorker = 'ready'
              })
            }
          }
        }
        localStorage.setItem(
          'art-file-preview:spreadsheet-test',
          JSON.stringify({
            file: {
              url: new URL('preview-test.xlsx', location.href).href,
              name: '产线数据预览.xlsx',
              fileType: 'xlsx'
            },
            expiresAt: Date.now() + 120_000
          })
        )
      })
      const workerRequest = page.waitForEvent(workerFailure ? 'requestfailed' : 'response', {
        predicate: (event) => event.url().endsWith('/vendor/xlsx/sheet.worker.js')
      })
      await page.goto('#/file-preview?key=spreadsheet-test')
      await workerRequest
      const preview = page.locator('.art-file-viewer-page__body')
      await expect(preview.getByRole('button', { name: '测试产线', exact: true })).toBeVisible()
      await expect(preview.getByText('共 2,401 行，2 列，按视口预取平滑加载')).toBeVisible()
      if (!workerFailure)
        await expect(page.locator('html')).toHaveAttribute('data-sheet-worker', 'ready')
      const search = page.getByRole('search', { name: '搜索' })
      if (!(await search.isVisible()))
        await page.getByRole('button', { name: '搜索', exact: true }).click()
      await search.getByRole('searchbox').fill('Worker 回归样本')
      await search.getByRole('button', { name: '搜索', exact: true }).click()
      await expect(search.getByText('1/1', { exact: true })).toBeVisible()
      expect(errors).toEqual([])
    })
  }
})

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

test('代码附件保留高亮原文，HTML 可从沙箱切回源代码', async ({ page }) => {
  const fixtures = {
    'file-preview-source.ts': 'export   const value:number =  41\nconst label = "原文保留"\n',
    'file-preview-source.html':
      '<!doctype html>\n<html><body>  <strong>原文保留</strong></body></html>\n'
  }
  for (const [name, source] of Object.entries(fixtures)) {
    await page.route(`**/${name}`, (route) =>
      route.fulfill({ contentType: 'text/plain; charset=utf-8', body: source })
    )
  }
  await page.addInitScript((names) => {
    if (window.top !== window.self) return
    for (const name of names) {
      localStorage.setItem(
        `art-file-preview:${name}`,
        JSON.stringify({
          file: { name, url: new URL(name, location.href).href, fileType: name.split('.').at(-1) },
          expiresAt: Date.now() + 60_000
        })
      )
    }
  }, Object.keys(fixtures))

  for (const [name, source] of Object.entries(fixtures)) {
    await page.goto(`#/file-preview?key=${name}`)
    if (name.endsWith('.html')) {
      await expect(page.locator('.html-preview-frame')).toHaveAttribute('sandbox', '')
      await page.locator('[data-html-view="source"]').click()
    }
    const preview = page.locator('.code-viewer')
    const code = preview.locator('.code-area code')
    await expect(code.locator('[class^="hljs-"]').first()).toBeAttached()
    expect(await code.textContent()).toBe(source)
    await expect(code.locator('strong')).toHaveCount(0)
    await expect(preview.locator('.code-format-toggle')).toBeHidden()
  }
})
