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
