import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

for (const scenario of [
  { name: 'light-border-1440', width: 1440, theme: 'light', box: 'border-mode' },
  { name: 'dark-shadow-570', width: 570, theme: 'dark', box: 'shadow-mode' }
]) {
  test(`运单附件无效地址保留记录且不可访问 ${scenario.name}`, async ({ page }, info) => {
    await page.setViewportSize({ width: scenario.width, height: 900 })
    await prepareIsolatedSession(page)
    const unknownBackend: string[] = []
    const pageErrors: string[] = []
    let imageRequests = 0
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.route('**/docs/signed.png?token=image', (route) => {
      imageRequests++
      return route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=',
          'base64'
        )
      })
    })
    await page.route('**/rest/v1/**', (route) => {
      unknownBackend.push(route.request().url())
      return route.abort('blockedbyclient')
    })
    await page.route('**/storage/v1/**', (route) => {
      unknownBackend.push(route.request().url())
      return route.abort('blockedbyclient')
    })
    await page.route('**/functions/v1/**', (route) => {
      unknownBackend.push(route.request().url())
      return route.abort('blockedbyclient')
    })
    await page.goto(
      `/tests/e2e/fixtures/file-size-reuse.html?mode=tms-url-safety&theme=${scenario.theme}&box=${scenario.box}`,
      { waitUntil: 'domcontentloaded' }
    )

    const gallery = page.locator('.waybill-document-panel__gallery')
    const cards = gallery.locator('article')
    await expect(cards).toHaveCount(8)
    await expect(page.locator('.waybill-document-panel__heading-meta strong')).toHaveText('8')
    const signed = cards.filter({ has: page.locator('strong[title="装车资料.pdf"]') })
    await expect(signed).toHaveCount(1)
    await expect(signed.locator('strong')).toHaveText('装车资料.pdf')
    await expect(signed.getByRole('link', { name: '在新窗口打开文件' })).toHaveAttribute(
      'href',
      /token=secret-signature#fragment$/
    )
    await expect(signed.locator('strong')).not.toContainText('secret-signature')

    const explicit = cards.filter({ has: page.locator('strong[title="人工文件名.pdf"]') })
    await expect(explicit).toHaveCount(1)
    await expect(explicit.locator('strong')).toHaveText('人工文件名.pdf')
    await expect(explicit.getByRole('link', { name: '在新窗口打开文件' })).toHaveAttribute(
      'href',
      /ignored-name\.pdf\?token=keep$/
    )

    const relative = cards.filter({ has: page.locator('strong[title="相对附件.pdf"]') })
    await expect(relative).toHaveCount(1)
    await expect(relative.getByRole('link', { name: '在新窗口打开文件' })).toHaveAttribute(
      'href',
      /\/docs\/%E7%9B%B8%E5%AF%B9%E9%99%84%E4%BB%B6\.pdf\?token=relative$/
    )

    const signedImage = cards.filter({ has: page.locator('strong[title="signed.png"]') })
    await expect(signedImage).toHaveCount(1)
    await expect(signedImage.locator('strong')).toHaveText('signed.png')
    const image = signedImage.locator('.el-image img')
    await image.scrollIntoViewIfNeeded()
    await expect
      .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0)
    await image.click()
    const viewer = page.locator('.el-image-viewer__wrapper')
    await expect(viewer).toBeVisible()
    await expect(viewer.locator('img')).toHaveCount(1)
    await expect(viewer.locator('img')).toHaveAttribute('src', /signed\.png\?token=image$/)
    await page.screenshot({ path: info.outputPath(`waybill-preview-${scenario.name}.png`) })
    await page.keyboard.press('Escape')
    await expect(viewer).toHaveCount(0)

    const invalid = cards.filter({ hasText: '文件地址无效，请重新上传附件' })
    await expect(invalid).toHaveCount(4)
    for (const card of await invalid.all()) {
      const link = card.locator('.el-link[aria-label="在新窗口打开文件"]')
      await expect(link).toHaveClass(/is-disabled/)
      await expect(link).not.toHaveAttribute('href', /.+/)
      await expect(card.locator('.el-image')).toHaveCount(0)
      const warning = card.getByText('文件地址无效，请重新上传附件', { exact: true })
      await expect(warning).toBeVisible()
      expect(
        await warning.evaluate((element) => {
          const probe = document.createElement('span')
          probe.style.color = 'var(--el-text-color-regular)'
          element.appendChild(probe)
          const color = getComputedStyle(element).color
          const regular = getComputedStyle(probe).color
          probe.remove()
          return {
            matchesRegular: color === regular,
            wraps: getComputedStyle(element).whiteSpace !== 'nowrap',
            fits: element.scrollWidth <= element.clientWidth + 1
          }
        })
      ).toEqual({ matchesRegular: true, wraps: true, fits: true })
    }
    await invalid.first().locator('.el-link[aria-label="在新窗口打开文件"]').dispatchEvent('click')
    expect(
      await page.evaluate(() =>
        Boolean((window as Window & { __waybillJsExecuted?: boolean }).__waybillJsExecuted)
      )
    ).toBe(false)
    expect(unknownBackend).toEqual([])
    expect(imageRequests).toBeGreaterThan(0)
    expect(pageErrors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    await page.screenshot({
      path: info.outputPath(`waybill-url-${scenario.name}.png`),
      fullPage: true
    })
  })
}
