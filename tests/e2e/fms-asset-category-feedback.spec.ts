import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('资产类别弹窗区分字段校验与服务拒绝', async ({ page }, testInfo) => {
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

  await page.route('**/rest/v1/rpc/fms_list_account_set_options_secure', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        total: 1,
        records: [
          {
            id: '00000000-0000-0000-0000-000000000001',
            tenantId: '00000000-0000-0000-0000-000000000001',
            accountSetCode: 'TEST',
            accountSetName: '测试账套',
            status: 'active'
          }
        ]
      }
    })
  })
  let saveRequests = 0
  await page.route('**/rest/v1/rpc/save_fms_asset_category_secure', async (route) => {
    saveRequests += 1
    await route.fulfill({
      status: 403,
      json: { code: '42501', message: 'permission denied for relation' }
    })
  })

  await page.goto('http://127.0.0.1:3012/tests/e2e/fixtures/asset-category-feedback.html')
  await page.getByRole('button', { name: '打开资产类别弹窗' }).click()
  const dialog = page.getByRole('dialog', { name: '新建资产类别' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '创建类别' }).click()
  await expect(dialog.getByText('请输入类别编码')).toBeVisible()
  expect(saveRequests).toBe(0)
  await expect(page.locator('.el-message')).toHaveCount(0)

  await dialog.getByRole('textbox', { name: '类别编码' }).fill('TEST_CATEGORY')
  await dialog.getByRole('textbox', { name: '类别名称' }).fill('测试类别')
  await dialog.getByRole('button', { name: '创建类别' }).click()
  await expect(page.locator('.el-message')).toHaveCount(1)
  await expect(page.locator('.el-message')).toContainText('当前账号没有此操作权限')
  expect(saveRequests).toBe(1)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '创建类别' })).toBeEnabled()

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
  await page.screenshot({
    path: `.artifacts/fms-asset-category-${testInfo.project.name}-error.png`,
    animations: 'disabled'
  })
  await dialog.getByText('备注', { exact: true }).scrollIntoViewIfNeeded()
  await expect(dialog.getByText('备注', { exact: true })).toBeInViewport()
  await expect(dialog.getByRole('button', { name: '创建类别' })).toBeInViewport()
  await page.screenshot({
    path: `.artifacts/fms-asset-category-${testInfo.project.name}-lower.png`,
    animations: 'disabled'
  })
})
