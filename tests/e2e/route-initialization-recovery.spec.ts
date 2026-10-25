import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeEach(async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/rpc/current_user_role_names', (route) =>
    route.fulfill({ json: ['测试操作员'] })
  )
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'platform', name: '测试平台', baseUrl: '/', sort: 1 }] })
  )
  await mockApplicationMenus(page, {
    platform: [
      {
        id: 'recovery-test-console',
        parentId: null,
        name: 'Console',
        path: '/dashboard/console',
        component: '/dashboard/console',
        type: 'menu',
        meta: { title: '测试工作台', is_enable: true }
      }
    ]
  })
})

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }))
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth + 1)
}

test('菜单服务故障后，会话有效时重试进入系统主页', async ({ page }) => {
  test.setTimeout(120_000)
  let shouldFailMenuRequest = true

  await page.route('**/rest/v1/rpc/get_menus_for_current_applications', async (route) => {
    if (!shouldFailMenuRequest) {
      await route.fallback()
      return
    }

    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'PGRST503',
        message: 'Injected menu service failure'
      })
    })
  })

  await page.goto('#/dashboard/console', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: '服务暂时开小差' })).toBeVisible({
    timeout: 30_000
  })
  await expect(page).toHaveURL(/#\/500\?redirect=\/dashboard\/console/)
  await expect(page.getByRole('button', { name: '重试进入系统' })).toBeVisible()
  await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0)
  await expectNoHorizontalOverflow(page)

  shouldFailMenuRequest = false
  await page.getByRole('button', { name: '重试进入系统' }).click()

  await expect(page).toHaveURL(/#\/dashboard\/console/, { timeout: 60_000 })
  await expect(page.locator('.operations-dashboard')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0, { timeout: 60_000 })
})

test('会话失效时重试会退出并返回登录页', async ({ context, page }) => {
  await context.clearCookies()
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('#/500?redirect=/dashboard/console', { waitUntil: 'domcontentloaded' })

  await page.getByRole('button', { name: '重试进入系统', exact: true }).click()

  await expect(page).toHaveURL(/#\/auth\/login\?redirect=\//)
  await expect(page.locator('.auth-right-wrap .form')).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('用户可从服务异常页主动退出并返回登录页', async ({ page }) => {
  await page.goto('#/500?redirect=/', { waitUntil: 'domcontentloaded' })

  await page.getByRole('button', { name: '返回登录', exact: true }).click()

  await expect(page).toHaveURL(/#\/auth\/login\?redirect=\//)
  await expect(page.locator('.auth-right-wrap .form')).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

const dashboardComponentPattern =
  /(?:\/src\/views\/dashboard\/console\/index\.vue|\/assets\/console-[^/]+\.js)(?:\?.*)?$/

test('依赖版本过期导致首次模块导入失败时自动刷新文档恢复', async ({ page }) => {
  test.setTimeout(120_000)
  let failedRequest = false
  let documentRequests = 0
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests += 1
  })
  await page.route(dashboardComponentPattern, async (route) => {
    if (failedRequest) return route.continue()
    failedRequest = true
    await route.fulfill({ status: 504, contentType: 'text/plain', body: 'Outdated Optimize Dep' })
  })

  await page.goto('#/dashboard/console?recoveryProbe=1', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.operations-dashboard')).toBeVisible({ timeout: 90_000 })
  expect(failedRequest).toBe(true)
  expect(documentRequests).toBe(2)
  await expect(page).toHaveURL(/#\/dashboard\/console\?recoveryProbe=1$/)
  expect(new URL(page.url()).searchParams.has('__route_reload')).toBe(false)
  expect(await page.evaluate(() => sessionStorage.getItem('art-route-module-recovery'))).toBeNull()
})

test('持续模块故障达到刷新上限后停在 500，主动重试刷新文档恢复', async ({ page }) => {
  test.setTimeout(150_000)
  let shouldFail = true
  let documentRequests = 0
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests += 1
  })
  await page.route(dashboardComponentPattern, async (route) => {
    if (!shouldFail) return route.continue()
    await route.fulfill({ status: 504, contentType: 'text/plain', body: 'Outdated Optimize Dep' })
  })

  await page.goto('#/dashboard/console', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: '重试进入系统', exact: true })).toBeVisible({
    timeout: 90_000
  })
  await expect(page).toHaveURL(/#\/500\?redirect=\/dashboard\/console$/)
  expect(documentRequests).toBe(3)
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('art-route-module-recovery')!).attempts
    )
  ).toBe(2)
  await expectNoHorizontalOverflow(page)

  shouldFail = false
  await page.getByRole('button', { name: '重试进入系统', exact: true }).click()
  await expect(page.locator('.operations-dashboard')).toBeVisible({ timeout: 60_000 })
  await expect(page).toHaveURL(/#\/dashboard\/console$/)
  expect(documentRequests).toBe(4)
  expect(await page.evaluate(() => sessionStorage.getItem('art-route-module-recovery'))).toBeNull()
})
