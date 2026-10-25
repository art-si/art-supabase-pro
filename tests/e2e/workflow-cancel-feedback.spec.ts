import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('终止原因校验与服务拒绝分别给出一次反馈', async ({ page }, testInfo) => {
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
  await page.route('**/rest/v1/rpc/cancel_workflow_instance', async (route) => {
    requests += 1
    await route.fulfill({
      status: 403,
      json: { code: '42501', message: 'permission denied for relation' }
    })
  })

  await page.goto('/tests/e2e/fixtures/workflow-cancel-feedback.html')
  await page.getByRole('button', { name: '打开终止审批弹窗' }).click()
  const dialog = page.getByRole('dialog', { name: '终止审批流程' })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: '确认终止' }).click()
  await expect(dialog.getByText('请填写终止原因')).toBeVisible()
  expect(requests).toBe(0)
  await expect(page.locator('.el-message')).toHaveCount(0)

  await dialog.getByRole('textbox', { name: '终止原因' }).fill('测试终止原因')
  await dialog.getByRole('button', { name: '确认终止' }).click()
  await expect(page.locator('.el-message')).toHaveCount(1)
  await expect(page.locator('.el-message')).toContainText('当前账号没有此操作权限')
  expect(requests).toBe(1)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '确认终止' })).toBeEnabled()
  await expect(dialog.getByText('请填写终止原因')).toHaveCount(0)

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
  await page.screenshot({
    path: `.artifacts/workflow-cancel-${testInfo.project.name}-error.png`,
    animations: 'disabled'
  })
})
