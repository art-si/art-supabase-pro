import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { collectAppRuntimeErrors } from './support/runtime-errors'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { installDictionaryOptions } from './support/dictionary-options'

test.use({ storageState: { cookies: [], origins: [] } })
const runtimeErrors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => runtimeErrors.set(page, collectAppRuntimeErrors(page)))
test.afterEach(async ({ page }) => expect(runtimeErrors.get(page) ?? []).toEqual([]))

async function prepareWebsiteSession(page: Page): Promise<void> {
  await prepareIsolatedSession(page)
  await installDictionaryOptions(page, {
    sysWebsiteLanguage: [
      { value: 'zh', label: '中文' },
      { value: 'en', label: 'English' }
    ],
    sysWatermarkContentType: [
      { value: 'username', label: '用户名' },
      { value: 'username_time', label: '用户名与时间' },
      { value: 'site_name', label: '系统名称' },
      { value: 'custom', label: '自定义内容' }
    ],
    sysCaptchaProvider: [{ value: 'turnstile', label: 'Turnstile' }],
    sysTurnstileSize: [
      { value: 'normal', label: '标准' },
      { value: 'compact', label: '紧凑' },
      { value: 'hidden', label: '隐藏' }
    ],
    sysTurnstileTheme: [
      { value: 'auto', label: '自动' },
      { value: 'light', label: '浅色' },
      { value: 'dark', label: '深色' }
    ]
  })
}

test('the native full website configuration keeps its login and SEO sections', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000)
  await prepareWebsiteSession(page)
  await page.goto('/tests/e2e/fixtures/shared-navigation-card-surfaces.html?page=website', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByRole('heading', { name: '网站配置' })).toBeVisible()
  await expect(page.getByRole('button', { name: '登录体验' })).toBeVisible()
  await expect(page.getByRole('button', { name: '认证渠道' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'SEO 展现' })).toBeVisible()
  await expect(page.getByText('Turnstile Site Key')).toBeVisible()
  await expect(page.locator('#identity input').first()).toBeVisible()
  await expect(page.getByText('Turnstile', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('用户名', { exact: true }).first()).toBeVisible()
  await captureBusinessEvidence(page, {
    path: testInfo.outputPath('full-website-config.png'),
    fullPage: true
  })
  await page.getByRole('button', { name: '登录体验', exact: true }).click()
  await expect(page.locator('#login')).toBeInViewport()
  await captureBusinessEvidence(page, {
    path: testInfo.outputPath('website-login-section.png'),
    fullPage: true
  })
  await page.getByRole('button', { name: 'SEO 展现', exact: true }).click()
  await expect(page.locator('#seo')).toBeInViewport()
  await captureBusinessEvidence(page, {
    path: testInfo.outputPath('website-seo-section.png'),
    fullPage: true
  })
})

test('failed website publication preserves the form without a false success or Vue error', async ({
  page
}) => {
  await prepareWebsiteSession(page)
  let reads = 0
  let writes = 0
  await page.route('**/rest/v1/sys_param?*', (route) => {
    if (route.request().method() === 'PATCH') {
      writes++
      return route.fulfill({ status: 409, json: { code: '23505', message: 'fixture conflict' } })
    }
    reads++
    return route.fulfill({
      json: {
        id: 'synthetic-website-config',
        param_key: 'website.config',
        param_value: JSON.stringify({ siteName: '验收网站' })
      }
    })
  })
  await page.goto(
    '/tests/e2e/fixtures/shared-navigation-card-surfaces.html?page=website&super=true'
  )
  const siteName = page.getByRole('textbox', { name: /^\*?\s*系统名称$/ })
  await expect(siteName).toHaveValue('验收网站')
  await siteName.fill('保留未发布输入')
  const initialReads = reads
  const publish = page.getByRole('button', { name: '保存并发布配置' })
  await publish.click()
  await expect.poll(() => writes).toBe(1)
  await expect(publish).not.toHaveClass(/is-loading/)
  await expect(siteName).toHaveValue('保留未发布输入')
  await expect(page.getByText('网站配置已发布', { exact: true })).toHaveCount(0)
  await expect(publish).toBeEnabled()
  expect(reads).toBe(initialReads)
})
