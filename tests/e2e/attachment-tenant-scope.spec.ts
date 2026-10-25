import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('附件面板只跟随顶部租户范围，全部租户上传默认平台租户', async ({ page }) => {
  const listRequests: string[] = []
  await page.route('**/rest/v1/sys_attachment?*', (route) => {
    listRequests.push(route.request().url())
    return route.fulfill({ status: 200, json: [] })
  })

  await page.goto('/tests/e2e/fixtures/attachment-tenant-scope.html')
  await expect(page.getByRole('combobox', { name: '资源所属租户' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '粘贴剪贴板文件并上传' })).toBeEnabled()
  await expect.poll(() => listRequests.length).toBeGreaterThan(0)
  expect(new URL(listRequests.at(-1)!).searchParams.get('tenant_id')).toBeNull()
  await page.screenshot({ path: '.artifacts/attachment-scope-desktop.png', animations: 'disabled' })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: '粘贴剪贴板文件并上传' })).toBeEnabled()
  const width = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(width.content).toBeLessThanOrEqual(width.viewport + 1)
  await page.screenshot({ path: '.artifacts/attachment-scope-mobile.png', animations: 'disabled' })

  await page.getByRole('button', { name: '切换业务租户' }).click()
  await expect.poll(() => listRequests.length).toBeGreaterThan(1)
  expect(listRequests.at(-1)).toContain('11111111-1111-4111-8111-111111111111')
  await expect(page.getByRole('combobox', { name: '资源所属租户' })).toHaveCount(0)
})
