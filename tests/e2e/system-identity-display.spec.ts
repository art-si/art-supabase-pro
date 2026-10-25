import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

test('个人中心显示数据库角色名称并兼容空角色', async ({ page }) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/rpc/current_user_role_names', (route) =>
    route.fulfill({ json: ['自定义业务审核员'] })
  )
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'platform', name: '测试平台', baseUrl: '/', sort: 1 }] })
  )
  await mockApplicationMenus(page, {
    platform: [
      {
        id: 'identity-profile-menu',
        name: 'UserCenter',
        path: '/system/user-center',
        component: '/system/user-center',
        type: 'menu',
        meta: { title: '个人中心', is_enable: true },
        children: []
      }
    ]
  })
  await page.goto('#/system/user-center', { waitUntil: 'domcontentloaded' })
  const root = page.locator('.user-center')
  await expect(root).toBeVisible({ timeout: 60_000 })
  await expect(root.getByText('自定义业务审核员', { exact: true })).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  ).toBe(false)
  await page.screenshot({ path: test.info().outputPath('role-names.png'), animations: 'disabled' })
  await page.evaluate(async () => {
    const storePath = '/src/store/modules/user.ts'
    const { useUserStore } = await import(/* @vite-ignore */ storePath)
    const store = useUserStore()
    store.setUserInfo({ ...store.info, roleNames: [], userRoles: [] })
  })
  await expect(root.getByText('未分配角色', { exact: true })).toBeVisible()
})
