import { expect, test, type Page } from '@playwright/test'
import type {} from './fixtures/theme-svg'

test.use({ storageState: { cookies: [], origins: [] } })

const svg = (id: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="${id}" fill="#006EFF" width="100" height="100"/></svg>`

async function setSource(page: Page, value: string): Promise<void> {
  await page.evaluate((value) => window.themeSvgFixture.setSource(value), value)
}

async function respond(page: Page, index: number, markup: string): Promise<void> {
  await page.evaluate(({ index, markup }) => window.themeSvgFixture.respond(index, markup), {
    index,
    markup
  })
}

async function flushRender(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
}

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/theme-svg.html')
  await page.waitForFunction(() => Boolean(window.themeSvgFixture))
})

test('SVG 移除脚本、事件、危险链接与 HTML，保留滤镜和主题颜色', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await setSource(page, '/quality-svg/unsafe')
  await respond(
    page,
    0,
    `<svg xmlns="http://www.w3.org/2000/svg" onload="window.themeSvgExecuted=true">
      <script>window.themeSvgExecuted=true</script>
      <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">unsafe</div></foreignObject>
      <a href="javascript:window.themeSvgExecuted=true"><text>危险链接</text></a>
      <defs><filter id="soft"><feGaussianBlur stdDeviation="1"/></filter></defs>
      <rect id="safe" fill="#006EFF" width="10" height="10"/>
    </svg>`
  )
  await expect(page.locator('#safe')).toHaveAttribute('fill', 'var(--el-color-primary)')
  await expect(page.locator('.svg-container feGaussianBlur')).toHaveCount(1)
  await expect(
    page.locator('.svg-container script, .svg-container foreignObject, .svg-container [onload]')
  ).toHaveCount(0)
  await expect(page.locator('.svg-container [href^="javascript:"]')).toHaveCount(0)
  expect(await page.evaluate(() => window.themeSvgExecuted)).toBeUndefined()
  expect(pageErrors).toEqual([])
})

test('旧请求晚于新请求完成时不覆盖新插画', async ({ page }) => {
  await setSource(page, '/quality-svg/A')
  await setSource(page, '/quality-svg/B')
  await respond(page, 1, svg('B'))
  await expect(page.locator('#B')).toBeAttached()
  await respond(page, 0, svg('A'))
  await flushRender(page)
  await expect(page.locator('#B')).toBeAttached()
  await expect(page.locator('#A')).toHaveCount(0)
  expect(await page.evaluate(() => window.themeSvgFixture.requests()[0].aborted)).toBe(true)
})

test('旧请求失败时不清空新插画', async ({ page }) => {
  await setSource(page, '/quality-svg/A')
  await setSource(page, '/quality-svg/B')
  await respond(page, 1, svg('B'))
  await expect(page.locator('#B')).toBeAttached()
  await page.evaluate(() => window.themeSvgFixture.fail(0))
  await flushRender(page)
  await expect(page.locator('#B')).toBeAttached()
})

test('读取旧响应体期间切换来源不覆盖新插画', async ({ page }) => {
  await setSource(page, '/quality-svg/A')
  await page.evaluate(() => window.themeSvgFixture.deferBody(0))
  await setSource(page, '/quality-svg/B')
  await respond(page, 1, svg('B'))
  await expect(page.locator('#B')).toBeAttached()
  await page.evaluate((markup) => window.themeSvgFixture.releaseBody(0, markup), svg('A'))
  await flushRender(page)
  await expect(page.locator('#B')).toBeAttached()
  await expect(page.locator('#A')).toHaveCount(0)
})

test('来源 A→B→A 时首个 A 仍视为过期请求', async ({ page }) => {
  await setSource(page, '/quality-svg/A')
  await setSource(page, '/quality-svg/B')
  await setSource(page, '/quality-svg/A')
  await respond(page, 2, svg('latest'))
  await expect(page.locator('#latest')).toBeAttached()
  await respond(page, 0, svg('stale'))
  await respond(page, 1, svg('staleB'))
  await flushRender(page)
  await expect(page.locator('#latest')).toBeAttached()
  await expect(page.locator('#stale, #staleB')).toHaveCount(0)
})

test('卸载与清空来源取消请求，后续响应不重建内容', async ({ page }) => {
  await setSource(page, '/quality-svg/A')
  await setSource(page, '')
  expect(await page.evaluate(() => window.themeSvgFixture.requests()[0].aborted)).toBe(true)
  await respond(page, 0, svg('stale'))
  await flushRender(page)
  await expect(page.locator('.svg-container')).toHaveCount(0)
  await setSource(page, '/quality-svg/B')
  await page.evaluate(() => window.themeSvgFixture.unmount())
  expect(await page.evaluate(() => window.themeSvgFixture.requests()[1].aborted)).toBe(true)
  await respond(page, 1, svg('late'))
  await flushRender(page)
  await expect(page.locator('.theme-svg')).toHaveCount(0)
})

test('当前请求失败可通过新来源重试恢复', async ({ page }) => {
  await setSource(page, '/quality-svg/fail')
  await page.evaluate(() => window.themeSvgFixture.respond(0, '', 503))
  await flushRender(page)
  await expect(page.locator('.svg-container svg')).toHaveCount(0)
  await setSource(page, '/quality-svg/retry')
  await respond(page, 1, svg('retry'))
  await expect(page.locator('#retry')).toBeAttached()
})
