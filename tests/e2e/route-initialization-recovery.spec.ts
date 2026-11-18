import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
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

for (const failure of [
  { status: 403, code: '42501', path: '/403', heading: '暂无查看权限' },
  { status: 503, code: 'PGRST503', path: '/500', heading: '服务暂时开小差' }
]) {
  test(`有效会话文件预览不受菜单 ${failure.status} 阻断，业务页面仍保留原访问边界`, async ({
    page
  }, info) => {
    test.setTimeout(120_000)
    let failedMenuRequests = 0
    await page.route('**/rest/v1/rpc/get_menus_for_current_applications', (route) => {
      failedMenuRequests++
      return route.fulfill({
        status: failure.status,
        json: { code: failure.code, message: 'Injected independent menu failure' }
      })
    })
    await page.addInitScript(() => {
      localStorage.setItem(
        'art-file-preview:menu-independent',
        JSON.stringify({
          file: {
            url: new URL('/tests/e2e/fixtures/preview-safe.png', location.href).href,
            name: '已授权附件.png',
            fileType: 'png'
          },
          expiresAt: Date.now() + 120_000
        })
      )
    })

    await page.goto('#/file-preview?key=menu-independent', { waitUntil: 'domcontentloaded' })
    await expect(
      page.locator('.art-file-viewer-page__header').getByRole('heading', { level: 1 })
    ).toHaveText('已授权附件.png', { timeout: 30_000 })
    const image = page.locator('.art-file-viewer-page__body img').first()
    await expect(image).toBeVisible()
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0)
    await expect(page).toHaveURL(/#\/file-preview\?key=menu-independent$/)
    await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0)
    await page.screenshot({ path: info.outputPath(`file-preview-menu-${failure.status}.png`) })

    if (failure.status === 403) {
      const safeImage = await readFile(new URL('./fixtures/preview-safe.png', import.meta.url))
      let resourceRequests = 0
      await page.route('**/file-preview-denied.png', (route) => {
        resourceRequests++
        return resourceRequests <= 2
          ? route.fulfill({ status: 403, contentType: 'text/plain', body: 'File access denied' })
          : route.fulfill({ status: 200, contentType: 'image/png', body: safeImage })
      })
      await page.evaluate(() => {
        const file = {
          url: new URL('/file-preview-denied.png', location.href).href,
          name: '无权读取附件.png',
          fileType: 'png'
        }
        for (const [key, entry] of Object.entries({
          'menu-denied': { file, expiresAt: Date.now() + 60_000 },
          'menu-expired': { file, expiresAt: Date.now() - 1 },
          'menu-invalid': {
            file: { ...file, url: 'javascript:alert(1)' },
            expiresAt: Date.now() + 60_000
          }
        }))
          localStorage.setItem(`art-file-preview:${key}`, JSON.stringify(entry))
      })
      const deniedResponse = page.waitForResponse((response) =>
        response.url().endsWith('/file-preview-denied.png')
      )
      await page.goto('#/file-preview?key=menu-denied', { waitUntil: 'domcontentloaded' })
      expect((await deniedResponse).status()).toBe(403)
      const preview = page.locator('.art-file-viewer-page__body')
      await expect(preview.getByText('无法打开文件预览', { exact: true })).toBeVisible()
      const feedback = preview.locator('.el-result__subtitle')
      await expect(feedback).toContainText(/附件.*失败/)
      await expect(feedback).toContainText(/网络|权限/)
      await expect(preview).not.toContainText(/HTTP\s*403|File access denied|Failed to fetch/)
      const retry = preview.getByRole('button', { name: '重新加载', exact: true })
      await expect(retry).toBeVisible()
      expect(resourceRequests).toBe(1)
      expect(
        await preview
          .locator('img')
          .evaluateAll((images) =>
            images.some((image) => image instanceof HTMLImageElement && image.naturalWidth > 0)
          )
      ).toBe(false)
      await page.screenshot({ path: info.outputPath('file-preview-resource-denied.png') })

      const secondFailure = page.waitForResponse((response) =>
        response.url().endsWith('/file-preview-denied.png')
      )
      await retry.press('Enter')
      expect((await secondFailure).status()).toBe(403)
      await expect(feedback).toContainText(/附件.*失败/)
      await expect(preview).not.toContainText(/HTTP\s*403|File access denied|Failed to fetch/)
      await expect(retry).toBeFocused()
      expect(resourceRequests).toBe(2)

      const restoredResponse = page.waitForResponse((response) =>
        response.url().endsWith('/file-preview-denied.png')
      )
      await page.keyboard.press('Enter')
      expect((await restoredResponse).status()).toBe(200)
      const restoredImage = preview.locator('img').first()
      await expect(restoredImage).toBeVisible()
      await expect
        .poll(() => restoredImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBeGreaterThan(0)
      await expect(preview.getByText('无法打开文件预览', { exact: true })).toHaveCount(0)
      expect(resourceRequests).toBe(3)
      await page.screenshot({ path: info.outputPath('file-preview-resource-recovered.png') })

      for (const key of ['menu-expired', 'menu-invalid']) {
        await page.goto(`#/file-preview?key=${key}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('无法打开文件预览', { exact: true })).toBeVisible()
        await expect(
          page.getByText('预览地址不存在或已过期，请从附件名称重新打开', { exact: true })
        ).toBeVisible()
        await expect(preview.locator('img')).toHaveCount(0)
        expect(
          await page.evaluate((key) => localStorage.getItem(`art-file-preview:${key}`), key)
        ).toBeNull()
      }
    }

    await page.goto('#/dashboard/console', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: failure.heading, exact: true })).toBeVisible({
      timeout: 30_000
    })
    expect(new URL(page.url()).hash).toBe(`#${failure.path}?redirect=/dashboard/console`)
    expect(failedMenuRequests).toBeGreaterThan(0)
    await expect(page.locator('.operations-dashboard')).toHaveCount(0)
    expect(
      await page.evaluate(() => {
        const serialized = localStorage.getItem('sb-ckbftoopuyophiebamwy-auth-token')
        if (!serialized) return false
        const session = JSON.parse(serialized)
        return session.user?.id === 'permission-test-auth' && session.expires_at > Date.now() / 1000
      })
    ).toBe(true)
  })
}

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
