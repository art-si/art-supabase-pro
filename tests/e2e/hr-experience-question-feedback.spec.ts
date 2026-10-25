import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('题目校验只在字段内提示，保存失败显示一次可读反馈', async ({ page }, testInfo) => {
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

  let saveRequests = 0
  await page.route('**/rest/v1/rpc/hr_save_employee_experience_record_secure', async (route) => {
    saveRequests += 1
    await route.fulfill({
      status: 403,
      json: { code: '42501', message: 'permission denied for relation' }
    })
  })

  await page.goto('/tests/e2e/fixtures/hr-experience-question.html')
  await page.getByRole('button', { name: '打开题目弹窗' }).click()
  const dialog = page.getByRole('dialog', { name: '新增调查题目' })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: '添加题目' }).click()
  await expect(dialog.getByText('请输入题目内容')).toBeVisible()
  expect(saveRequests).toBe(0)
  await expect(page.locator('.el-message')).toHaveCount(0)

  await dialog.getByRole('textbox', { name: '题目内容' }).fill('最近一周我有完成工作的条件')
  await dialog.getByRole('button', { name: '添加题目' }).click()
  await expect(page.locator('.el-message')).toHaveCount(1)
  await expect(page.locator('.el-message')).toContainText('当前账号没有此操作权限')
  expect(saveRequests).toBe(1)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '添加题目' })).toBeEnabled()
  await expect(dialog.getByText('请输入题目内容')).toHaveCount(0)

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
  await page.screenshot({
    path: `.artifacts/hr-experience-question-${testInfo.project.name}-error.png`,
    animations: 'disabled'
  })
})
