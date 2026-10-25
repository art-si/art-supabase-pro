import { test, expect } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test('司机关联版本冲突保留窗口并显示一次错误', async ({ page }) => {
  await page.route('**/rest/v1/rpc/vms_link_violation_driver_secure', (route) =>
    route.fulfill({
      status: 409,
      json: { code: '40001', message: '记录已被更新，请刷新后重新关联' }
    })
  )
  await page.goto('/tests/e2e/fixtures/vms-driver-link.html')
  await page.getByRole('button', { name: '关联司机', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '关联违章司机', exact: true })
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
  await expect(dialog.getByRole('textbox')).toHaveValue('关联司机甲')
})

test('司机关联响应超时释放加载且保留选择', async ({ page }) => {
  test.setTimeout(90_000)
  let requested = false
  await page.route('**/rest/v1/rpc/vms_link_violation_driver_secure', async (route) => {
    requested = true
    expect(route.request().postDataJSON()).toMatchObject({
      p_id: 'violation-1',
      p_driver_id: 'driver-1',
      p_expected_updated_at: '2026-10-25T05:00:00Z'
    })
    // An unresolved transport response models a committed write whose response was lost.
  })
  await page.goto('/tests/e2e/fixtures/vms-driver-link.html')
  await page.getByRole('button', { name: '关联司机', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '关联违章司机', exact: true })
  const confirm = dialog.getByRole('button', { name: '确定', exact: true })
  await confirm.click()
  await expect.poll(() => requested).toBe(true)
  await expect(confirm).toBeDisabled()
  await expect(
    page.getByText('保存结果暂未确认，请关闭窗口并刷新列表，核对司机关联后再操作', { exact: true })
  ).toBeVisible({ timeout: 40_000 })
  await expect(confirm).toBeEnabled()
  await expect(dialog.getByRole('textbox')).toHaveValue('关联司机甲')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
})
