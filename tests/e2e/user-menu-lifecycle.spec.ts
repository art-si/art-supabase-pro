import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('退出确认延迟期间卸载菜单不会产生旧对话框', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.clock.install()
  await page.goto('/tests/e2e/fixtures/user-menu-lifecycle.html')
  await page.getByRole('button', { name: '打开用户菜单' }).click()
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await page.getByRole('button', { name: '卸载用户菜单' }).click()
  await page.clock.runFor(500)
  await expect(page.locator('.login-out-dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '打开用户菜单' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('键盘关闭菜单后恢复触发按钮焦点', async ({ page }, testInfo) => {
  await page.clock.install()
  await page.goto('/tests/e2e/fixtures/user-menu-lifecycle.html')
  const trigger = page.getByRole('button', { name: '打开用户菜单' })
  await trigger.click()
  const firstItem = page.locator('.user-menu-popover .btn-item').first()
  await expect(firstItem).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath('user-menu.png'), animations: 'disabled' })
  await firstItem.press('Escape')
  await page.clock.runFor(200)
  await expect(trigger).toBeFocused()
  await expect(page.locator('.user-menu-popover')).toBeHidden()
})
