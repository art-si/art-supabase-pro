import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

test('the native full website configuration keeps its login and SEO sections', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/shared-navigation-card-surfaces.html?page=website', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByRole('heading', { name: '网站配置' })).toBeVisible()
  await expect(page.getByRole('button', { name: '登录体验' })).toBeVisible()
  await expect(page.getByRole('button', { name: '认证渠道' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'SEO 展现' })).toBeVisible()
  await expect(page.getByText('Turnstile Site Key')).toBeVisible()
  await expect(page.locator('#identity input').first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('full-website-config.png'), fullPage: true })
})

test('branding profile shows reusable identity and watermark fields without pro auth controls', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/sys_param?*', (route) =>
    route.fulfill(
      route.request().method() === 'PATCH'
        ? { status: 409, json: { code: 'BFF_CONFLICT', message: 'Configuration changed' } }
        : {
            json: {
              id: 'synthetic-brand',
              param_key: 'website.config',
              param_value: JSON.stringify({
                siteName: 'BFF平台',
                siteShortName: 'BFF',
                siteDescription: '统一管理应用、上游与接口发布',
                logoUrl: '/synthetic-logo.svg',
                faviconUrl: '/synthetic-favicon.svg',
                watermarkEnabled: true,
                watermarkContentType: 'site_name',
                watermarkCustomText: ''
              })
            }
          }
    )
  )
  await page.route('**/rest/v1/sys_dictionary?*', (route) =>
    route.fulfill({
      json: [
        { id: 'watermark-user', value: 'username', label: '当前用户', status: '1', sort: 1 },
        {
          id: 'watermark-time',
          value: 'username_time',
          label: '用户名与时间',
          status: '1',
          sort: 2
        },
        { id: 'watermark-site', value: 'site_name', label: '站点名称', status: '1', sort: 3 },
        { id: 'watermark-custom', value: 'custom', label: '自定义文本', status: '1', sort: 4 }
      ]
    })
  )
  await page.route('**/synthetic-logo.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#5755db"/></svg>'
    })
  )
  await page.goto('/tests/e2e/fixtures/shared-navigation-card-surfaces.html?page=branding', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByRole('heading', { name: '系统品牌' })).toBeVisible()
  await expect(page.getByText('BFF平台', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: '系统标识' })).toBeVisible()
  await expect(page.getByRole('button', { name: '发布预览' })).toBeVisible()
  await expect(page.getByRole('button', { name: '登录体验' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '认证渠道' })).toHaveCount(0)
  await expect(page.getByText('Turnstile Site Key')).toHaveCount(0)
  await expect(page.getByText('上传 Logo')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '保存品牌配置' })).toBeDisabled()
  await expect(page.locator('#identity input').first()).toBeVisible()
  await expect(page.locator('.website-config-page__brand-preview')).toHaveAttribute(
    'src',
    '/synthetic-logo.svg'
  )
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        )
      )
      .toBeLessThanOrEqual(1)
    await page.screenshot({
      path: testInfo.outputPath(`branding-${width}.png`),
      fullPage: true
    })
  }
  const siteName = page.locator('#identity input').first()
  await siteName.fill('BFF平台改动')
  const save = page.getByRole('button', { name: '保存品牌配置' })
  await expect(save).toBeEnabled()
  await save.click()
  await expect(page.getByText('当前输入已保留')).toBeVisible()
  await expect(siteName).toHaveValue('BFF平台改动')
})

test('clearing a configured favicon removes it when the host had no original icon', async ({
  page
}) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/shared-navigation-card-surfaces.html?page=branding', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByRole('heading', { name: '系统品牌' })).toBeVisible()
  const favicon = page.locator('head link[rel~="icon"]')
  await expect(favicon).toHaveCount(0)
  await page.evaluate(() => {
    ;(window as Window & { __setFixtureFavicon?: (url: string) => void }).__setFixtureFavicon?.(
      '/synthetic-favicon.svg'
    )
  })
  await expect(favicon).toHaveAttribute('href', '/synthetic-favicon.svg')
  await page.evaluate(() => {
    ;(window as Window & { __setFixtureFavicon?: (url: string) => void }).__setFixtureFavicon?.('')
  })
  await expect(favicon).toHaveCount(0)
})
