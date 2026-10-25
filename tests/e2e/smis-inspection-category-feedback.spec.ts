import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('检验类别弹窗区分字段校验与服务拒绝', async ({ page }, testInfo) => {
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
  await page.route('**/rest/v1/rpc/smis_save_inspection_category_secure', async (route) => {
    saveRequests += 1
    await route.fulfill({
      status: 403,
      json: { code: '42501', message: 'permission denied for relation' }
    })
  })

  await page.goto('/modules/art-supabase-smis/tests/e2e/fixtures/inspection-category-feedback.html')
  await page.getByRole('button', { name: '打开检验类别弹窗' }).click()
  const dialog = page.getByRole('dialog', { name: '新增检验类别' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '保存检验类别' }).click()
  await expect(dialog.getByText('请输入检验类别编码')).toBeVisible()
  expect(saveRequests).toBe(0)
  await expect(page.locator('.el-message')).toHaveCount(0)

  await dialog.getByRole('textbox', { name: '检验类别编码' }).fill('EXTERNAL')
  await dialog.getByRole('textbox', { name: '检验类别名称' }).fill('外部检验')
  await dialog.getByRole('button', { name: '保存检验类别' }).click()
  await expect(page.locator('.el-message')).toHaveCount(1)
  await expect(page.locator('.el-message')).toContainText('当前账号没有此操作权限')
  expect(saveRequests).toBe(1)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '保存检验类别' })).toBeEnabled()

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
  await page.screenshot({
    path: `.artifacts/smis-inspection-category-${testInfo.project.name}-error.png`,
    animations: 'disabled'
  })
  await dialog.getByText('备注', { exact: true }).scrollIntoViewIfNeeded()
  await expect(dialog.getByText('备注', { exact: true })).toBeInViewport()
  await expect(dialog.getByRole('button', { name: '保存检验类别' })).toBeInViewport()
  await page.screenshot({
    path: `.artifacts/smis-inspection-category-${testInfo.project.name}-lower.png`,
    animations: 'disabled'
  })
})
