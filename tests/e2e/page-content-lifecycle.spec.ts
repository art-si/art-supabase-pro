import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.beforeEach(async ({ page }) => {
  await page.clock.install()
  await page.goto('/tests/e2e/fixtures/page-content-lifecycle.html')
  await expect(page.getByRole('heading', { name: '普通页面', exact: true })).toBeVisible()
})

test('全屏连续切换重新计算遮罩关闭时间', async ({ page }) => {
  const mask = page.locator('body > .pointer-events-none')
  await page.getByRole('button', { name: '全屏页', exact: true }).click()
  await expect(page.getByRole('heading', { name: '全屏页面' })).toBeVisible()
  await expect(mask).toBeVisible()
  await page.clock.runFor(30)
  await page.getByRole('button', { name: '普通页', exact: true }).click()
  await expect(page.getByRole('heading', { name: '普通页面' })).toBeVisible()
  await page.clock.runFor(25)
  await expect(mask).toBeVisible()
  await page.clock.runFor(25)
  await expect(mask).toBeHidden()
})

test('全屏切换后卸载移除遮罩且无延迟错误', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('button', { name: '全屏页', exact: true }).click()
  await page.getByRole('button', { name: '卸载页面容器' }).click()
  await page.clock.runFor(100)
  await expect(page.locator('.layout-content')).toHaveCount(0)
  await expect(page.locator('body > .pointer-events-none')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('页面高度跟随头部尺寸，卸载后不会覆盖新的高度所有者', async ({ page }) => {
  const heightVariable = () =>
    page.evaluate(() => document.documentElement.style.getPropertyValue('--art-full-height'))
  await page.clock.runFor(100)
  await expect.poll(heightVariable).toContain('- 40px -')
  await page.locator('#app-header').evaluate((element) => {
    element.style.height = '80px'
  })
  await page.clock.runFor(100)
  await expect.poll(heightVariable).toContain('- 80px -')
  await page.getByRole('button', { name: '卸载页面容器' }).click()
  await page.evaluate(() =>
    document.documentElement.style.setProperty('--art-full-height', '321px')
  )
  await page.locator('#app-header').evaluate((element) => {
    element.style.height = '120px'
  })
  await page.clock.runFor(100)
  expect(await heightVariable()).toBe('321px')
})
