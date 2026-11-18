import { expect, test } from '@playwright/test'
import { prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

test('个人中心登录方式的刷新失败和重试恢复后保留键盘焦点', async ({ page, hasTouch }, info) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 320, height: 700 })
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  await prepareIsolatedSession(page, { platformSuper: false })

  let reads = 0
  let state: 'empty' | 'failed' | 'linked' = 'empty'
  let pending: Promise<void> | undefined
  await page.route('**/auth/v1/user', async (route) => {
    reads++
    await pending
    if (state === 'failed') {
      return route.fulfill({
        status: 503,
        json: { code: 'unexpected_failure', message: '模拟账号读取暂时不可用' }
      })
    }
    return route.fulfill({
      json: {
        id: 'permission-test-auth',
        aud: 'authenticated',
        role: 'authenticated',
        identities:
          state === 'linked'
            ? [
                {
                  id: 'qa-google',
                  provider: 'google',
                  identity_data: { email: 'fixture@example.invalid' }
                }
              ]
            : []
      }
    })
  })
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
  await page.goto('#/system/user-center', { waitUntil: 'commit' })
  const tab = page.getByRole('tab', { name: '登录方式', exact: true })
  await expect(tab).toBeVisible({ timeout: 90_000 })
  if (hasTouch) await tab.tap()
  else await tab.click()
  const panel = page.locator('.login-methods')
  const region = panel.locator('.art-async-state')
  const refresh = panel.getByRole('button', { name: '刷新状态', exact: true })
  const retry = panel.getByRole('button', { name: '重新加载', exact: true })
  const empty = panel.getByText('暂无可管理的第三方登录方式', { exact: true })
  await expect(empty).toBeVisible()

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: width === 320 ? 700 : 844 })
    const before = reads
    let release = (): void => undefined
    pending = new Promise<void>((resolve) => {
      release = resolve
    })
    state = 'failed'
    await refresh.press('Enter')
    await expect.poll(() => reads).toBe(before + 1)
    await expect(region).toHaveAttribute('aria-busy', 'true')
    await expect(refresh).toBeDisabled()
    release()
    pending = undefined
    await expect(panel.getByText('内容加载失败', { exact: true })).toBeVisible()
    await expect(refresh).toBeFocused()
    await retry.scrollIntoViewIfNeeded()
    await expect(retry).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`login-methods-error-${width}.png`) })

    state = 'linked'
    await retry.press('Enter')
    await expect(
      panel.getByText('关联账号：fixture@example.invalid', { exact: true })
    ).toBeVisible()
    await expect(refresh).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)

    state = 'empty'
    if (hasTouch) await refresh.tap()
    else await refresh.click()
    await expect(empty).toBeVisible()
  }

  let resume = (): void => undefined
  pending = new Promise<void>((resolve) => {
    resume = resolve
  })
  await refresh.press('Enter')
  await expect(region).toHaveAttribute('aria-busy', 'true')
  await tab.focus()
  resume()
  pending = undefined
  await expect(empty).toBeVisible()
  await expect(tab).toBeFocused()
})
