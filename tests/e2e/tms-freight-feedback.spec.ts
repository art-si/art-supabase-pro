import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('运费保存失败显示一次友好反馈且保留弹窗', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => {
    localStorage.setItem(
      'sb-ckbftoopuyophiebamwy-auth-token',
      JSON.stringify({
        access_token: 'a.b.c',
        refresh_token: 'test-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: {
          id: '00000000-0000-0000-0000-000000000000',
          aud: 'authenticated',
          role: 'authenticated'
        }
      })
    )
  })

  let requests = 0
  await page.route('**/rest/v1/rpc/tms_update_order_secure', async (route) => {
    requests += 1
    await route.fulfill({
      status: 403,
      json: { code: '42501', message: 'permission denied for relation' }
    })
  })

  await page.goto('http://127.0.0.1:3016/tests/e2e/fixtures/freight-feedback.html')
  await page.getByRole('button', { name: '打开运费弹窗' }).click()
  const dialog = page.getByRole('dialog', { name: '修改运费' })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: '确定' }).click()
  await expect(page.locator('.el-message')).toHaveCount(1)
  await expect(page.locator('.el-message')).toContainText('当前账号没有此操作权限')
  expect(requests).toBe(1)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '确定' })).toBeEnabled()

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
  await page.screenshot({
    path: `.artifacts/tms-freight-${testInfo.project.name}-error.png`,
    animations: 'disabled'
  })
})
