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

test('failed website publication preserves the form without a false success or Vue error', async ({
  page
}) => {
  await prepareIsolatedSession(page)
  let reads = 0
  let writes = 0
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.text().includes('[VueError]')) errors.push(message.text())
  })
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
  const siteName = page.getByRole('textbox', { name: '系统名称', exact: true })
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
  expect(errors).toEqual([])
})
