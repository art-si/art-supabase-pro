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
  await expect(page.locator('#identity').getByRole('textbox', { name: /系统名称/ })).toBeVisible()
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
  await page.route('**/synthetic-favicon.svg', (route) =>
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
  await expect(page.getByText('上传 Logo')).toBeHidden()
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

test('品牌可编辑但无资源上传权限时，可从两个私有资源中选图且只读状态无入口', async ({
  page
}, info) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)
  const assets = [
    {
      id: 1,
      version: 1,
      tenant_id: 'navigation-fixture-tenant',
      origin_name: '合成品牌 Logo.png',
      mime_type: 'image/png',
      suffix: 'png',
      url: '/api/resources/1/content'
    },
    {
      id: 2,
      version: 2,
      tenant_id: 'navigation-fixture-tenant',
      origin_name: '合成浏览器图标.ico',
      mime_type: 'image/x-icon',
      suffix: 'ico',
      url: '/api/resources/2/content'
    }
  ]
  await page.route('**/rest/v1/sys_param?*', (route) =>
    route.fulfill({
      json: {
        id: 'synthetic-brand',
        param_key: 'website.config',
        param_value: JSON.stringify({
          siteName: 'BFF平台',
          siteShortName: 'BFF',
          logoUrl: '',
          faviconUrl: '',
          watermarkEnabled: false
        })
      }
    })
  )
  const resourceListRequests: string[] = []
  await page.route('**/rest/v1/sys_attachment?*', (route) => {
    resourceListRequests.push(route.request().url())
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-1/2' },
      body: JSON.stringify(assets)
    })
  })
  await page.route('**/api/resources/*/content', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/+wAAAABJRU5ErkJggg==',
        'base64'
      )
    })
  )
  const query =
    '?page=branding&resourceUpload=false&resourceView=true&resourceEdit=false&resourceDelete=false'
  await page.goto(`/tests/e2e/fixtures/shared-navigation-card-surfaces.html${query}`)
  await expect(page.getByRole('heading', { name: '系统品牌' })).toBeVisible()
  const resourceTriggers = page.getByRole('button', { name: '从资源库选择图片' })
  await expect(resourceTriggers).toHaveCount(2)
  await expect(page.locator('#identity .el-upload > .el-upload')).toHaveCount(0)
  await resourceTriggers.first().click()
  const dialog = page.getByRole('dialog', { name: '资源选择器' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '选择资源 合成品牌 Logo.png' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '选择资源 合成浏览器图标.ico' })).toBeVisible()
  expect(resourceListRequests.some((url) => decodeURIComponent(url).includes('ico'))).toBe(true)
  await expect(
    dialog.locator('.resource-item').nth(1).locator('.resource-media-cover.is-image')
  ).toBeVisible()
  await expect(dialog.locator('.resource-dock')).toHaveCount(0)
  await dialog.locator('.resource-item').first().click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: '重命名' })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: '删除' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  for (const scenario of [
    { name: 'light-1440', width: 1440, dark: false },
    { name: 'dark-1280', width: 1280, dark: true },
    { name: 'light-390', width: 390, dark: false }
  ]) {
    await page.setViewportSize({ width: scenario.width, height: 844 })
    await page.evaluate((dark) => {
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.dataset.boxMode = dark ? 'shadow-mode' : 'border-mode'
    }, scenario.dark)
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        )
      )
      .toBeLessThanOrEqual(1)
    await page.screenshot({
      path: info.outputPath(`branding-picker-${scenario.name}.png`),
      animations: 'disabled'
    })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await dialog.getByRole('button', { name: '选择资源 合成品牌 Logo.png' }).click()
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(page.locator('.website-config-page__brand-preview')).toHaveAttribute(
    'src',
    '/api/resources/1/content'
  )
  await expect(page.getByRole('button', { name: '保存品牌配置' })).toBeEnabled()

  await page.goto(
    '/tests/e2e/fixtures/shared-navigation-card-surfaces.html?page=branding&resourceUpload=false&resourceView=false'
  )
  await expect(page.getByRole('button', { name: '从资源库选择图片' })).toHaveCount(0)
  await expect(page.getByText('暂无图片资源权限')).toHaveCount(2)
  await page.goto(
    '/tests/e2e/fixtures/shared-navigation-card-surfaces.html?page=branding&canEdit=false&resourceUpload=false&resourceView=true'
  )
  await expect(page.getByRole('button', { name: '从资源库选择图片' })).toHaveCount(0)
  await expect(page.getByText('当前账号没有品牌配置编辑权限')).toBeVisible()
  await expect(page.getByRole('button', { name: '保存品牌配置' })).toHaveCount(0)
})
