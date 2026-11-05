import { expect, test } from '@playwright/test'

const fixture = '/tests/e2e/fixtures/global-focus-header.html'

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 720 } })

test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/sys_param')) {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          headers: { 'content-range': '0-0/1' },
          json: []
        })
        return
      }
      await route.fulfill({
        json: {
          id: 'focus-appearance-setting',
          param_key: 'ui.appearance.config',
          param_value: '{"globalFocusMode":false}',
          enabled: true
        }
      })
      return
    }
    await route.fulfill({ json: route.request().headers().accept?.includes('object') ? null : [] })
  })
})

test('普通用户在顶部栏本地切换全局专注', async ({ page }) => {
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/rest/v1/sys_param')) {
      writes.push(request.method())
    }
  })
  await page.goto(`${fixture}?ordinary`)

  const focus = page.getByRole('button', { name: '开启自动专注浏览' })
  await expect(focus).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.page-design-reference')).toHaveCount(0)
  await focus.click()
  await expect(page.getByRole('button', { name: '关闭自动专注浏览' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(page.getByRole('dialog', { name: '自动专注浏览' })).toHaveCount(0)
  expect(writes).toEqual([])
  expect(
    await page.evaluate(() =>
      Object.entries(localStorage).some(
        ([key, value]) => key.includes('global-focus-focus-ordinary-user') && value === 'true'
      )
    )
  ).toBe(true)
})

test('平台超管选择仅存本地或入库，并保持星标右侧布局', async ({ page }, testInfo) => {
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().includes('/rest/v1/sys_param')) {
      writes.push(request.postData() ?? '')
    }
  })
  await page.goto(fixture)

  const star = page.locator('.page-design-reference button').first()
  const focus = page.getByRole('button', { name: '开启自动专注浏览' })
  await expect(star).toBeVisible()
  await expect(focus).toHaveAttribute('aria-pressed', 'false')
  const starBox = await star.boundingBox()
  const focusBox = await focus.boundingBox()
  expect(starBox && focusBox && starBox.x + starBox.width <= focusBox.x).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280)
  await page.screenshot({ path: testInfo.outputPath('global-focus-header-1280.png') })

  await focus.click()
  const dialog = page.getByRole('dialog', { name: '自动专注浏览' })
  await expect(dialog.getByRole('button', { name: '入库保持' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '仅存本地' })).toBeVisible()
  await dialog.getByRole('button', { name: '仅存本地' }).click()
  await expect(page.getByRole('button', { name: '关闭自动专注浏览' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(writes).toEqual([])

  await page.getByRole('button', { name: '关闭自动专注浏览' }).click()
  await dialog.getByRole('button', { name: '入库保持' }).click()
  await expect(page.getByRole('button', { name: '开启自动专注浏览' })).toHaveAttribute(
    'aria-pressed',
    'false'
  )
  expect(writes).toHaveLength(1)
  expect(JSON.parse(writes[0]).param_value).toContain('"globalFocusMode":false')
})
