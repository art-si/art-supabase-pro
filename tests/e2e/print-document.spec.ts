import { expect, test } from '@playwright/test'
import path from 'node:path'

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript(() => {
    const activeUrls = new Set<string>()
    const createUrl = URL.createObjectURL.bind(URL)
    const revokeUrl = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (object) => {
      const url = createUrl(object)
      activeUrls.add(url)
      document.body?.setAttribute('data-active-urls', String(activeUrls.size))
      return url
    }
    URL.revokeObjectURL = (url) => {
      revokeUrl(url)
      activeUrls.delete(url)
      document.body?.setAttribute('data-active-urls', String(activeUrls.size))
    }
    window.print = () => {
      if (document.body.dataset.failPrint === 'true') throw new Error('synthetic SDK internals')
      document.body.dataset.printCount = String(Number(document.body.dataset.printCount || 0) + 1)
    }
  })
  await page.goto('/tests/e2e/fixtures/print-document.html', { waitUntil: 'domcontentloaded' })
})

test('打印窗口隔离来源且只打印一次', async ({ page }) => {
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: '打印文档', exact: true }).click()
  const popup = await popupPromise
  await expect(popup.locator('body')).toHaveAttribute('data-print-count', '1')
  await expect(page.locator('body')).toHaveAttribute('data-active-urls', '0')
  expect(await popup.evaluate(() => window.opener === null)).toBe(true)
  await expect(popup.getByText('数量：0', { exact: true })).toBeVisible()
  await popup.evaluate(() => window.dispatchEvent(new Event('load')))
  await expect(popup.locator('body')).toHaveAttribute('data-print-count', '1')
})

test('弹窗被拦截后提供一次中文提示并可重试', async ({ page }) => {
  await page.evaluate(() => {
    const originalOpen = window.open.bind(window)
    window.open = (...args) => (document.body.dataset.blocked ? null : originalOpen(...args))
    document.body.dataset.blocked = 'true'
  })
  await page.getByRole('button', { name: '打印文档', exact: true }).click()
  await expect(page.locator('.el-message')).toHaveCount(1)
  await expect(
    page.getByText('浏览器阻止了打印窗口，请允许本站打开弹窗后重试', { exact: true })
  ).toBeVisible()
  await expect(page.getByLabel('打印窗口结果')).toHaveText('未打开')
  await expect(page.locator('body')).toHaveAttribute('data-active-urls', '0')
  await page.evaluate(() => delete document.body.dataset.blocked)
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: '打印文档', exact: true }).click()
  await expect((await popupPromise).locator('body')).toHaveAttribute('data-print-count', '1')
})

test('图片就绪后再打印，图片缺失不阻塞业务文档', async ({ context, page }) => {
  let release = (): void => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await context.route('**/print-logo.svg', async (route) => {
    await held
    await route.fulfill({ status: 404, body: '' })
  })
  await page.evaluate(() => {
    document.body.dataset.image = 'true'
  })
  const popupPromise = page.waitForEvent('popup')
  try {
    await page.getByRole('button', { name: '打印文档', exact: true }).click()
    const popup = await popupPromise
    await expect(popup.getByRole('heading', { name: '测试业务文档' })).toBeVisible()
    await expect(popup.locator('body')).not.toHaveAttribute('data-print-count')
    release()
    await expect(popup.locator('body')).toHaveAttribute('data-print-count', '1')
    await expect(page.locator('.el-message')).toHaveCount(0)
  } finally {
    release()
  }
})

test('关闭等待资源的窗口不会触发延迟打印或错误提示', async ({ context, page }) => {
  let release = (): void => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await context.route('**/print-logo.svg', async (route) => {
    await held
    await route.abort()
  })
  await page.evaluate(() => {
    document.body.dataset.image = 'true'
  })
  const popupPromise = page.waitForEvent('popup')
  try {
    await page.getByRole('button', { name: '打印文档', exact: true }).click()
    const popup = await popupPromise
    await expect(popup.getByRole('heading', { name: '测试业务文档' })).toBeVisible()
    await popup.close()
    release()
    await expect(page.locator('body')).toHaveAttribute('data-active-urls', '0')
    await expect(page.locator('.el-message')).toHaveCount(0)
  } finally {
    release()
  }
})

test('打印异常显示中文恢复提示，不泄露原始错误', async ({ page }) => {
  await page.evaluate(() => {
    document.body.dataset.failPrint = 'true'
  })
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: '打印文档', exact: true }).click()
  await popupPromise
  await expect(page.locator('.el-message')).toHaveCount(1)
  await expect(page.getByText('打印失败，请关闭打印窗口后重试', { exact: true })).toBeVisible()
  await expect(page.getByText('synthetic SDK internals', { exact: true })).toHaveCount(0)
  await expect(page.locator('body')).toHaveAttribute('data-active-urls', '0')
})

test('字体加载完成后再打印并回收临时文档地址', async ({ context, page }) => {
  let release = (): void => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await context.route('**/print-font.woff2', async (route) => {
    await held
    await route.fulfill({
      contentType: 'font/woff2',
      path: path.resolve('src/assets/fonts/HarmonyOS_Sans/HarmonyOS_Sans_Regular.woff2')
    })
  })
  await page.evaluate(() => {
    document.body.dataset.font = 'true'
  })
  const popupPromise = page.waitForEvent('popup')
  try {
    await page.getByRole('button', { name: '打印文档', exact: true }).click()
    const popup = await popupPromise
    await popup.waitForFunction(() => document.fonts.status === 'loading')
    await expect(popup.locator('body')).not.toHaveAttribute('data-print-count')
    release()
    await expect(popup.locator('body')).toHaveAttribute('data-print-count', '1')
    await expect(page.locator('body')).toHaveAttribute('data-active-urls', '0')
  } finally {
    release()
  }
})
