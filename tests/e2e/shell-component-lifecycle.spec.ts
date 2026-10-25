import { expect, test, type Page, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.setTimeout(120_000)
const shortcut = (page: Page) =>
  page.evaluate(() =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
    )
  )

test('全局懒加载卸载后不重放，快捷键重挂载恢复', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/shell-component-lifecycle.html?mode=global')
  await expect.poll(() => shortcut(page)).toBe(false)
  await expect(page.getByLabel('加载次数')).toHaveText('1')
  await page.getByRole('button', { name: '切换组件', exact: true }).click()
  expect(await shortcut(page)).toBe(true)
  await page.getByRole('button', { name: '完成组件加载', exact: true }).click()
  await expect(page.getByLabel('重放次数')).toHaveText('0')
  await expect(page.locator('.art-global-search-dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '切换组件', exact: true }).click()
  await expect.poll(() => shortcut(page)).toBe(false)
  await expect(page.getByLabel('加载次数')).toHaveText('2')
  await page.getByRole('button', { name: '完成组件加载', exact: true }).click()
  await expect(page.locator('.art-global-search-dialog')).toBeVisible()
  await expect(page.getByLabel('重放次数')).toHaveText('1')
  await page.keyboard.press('Escape')
  await expect(page.locator('.art-global-search-dialog')).toBeHidden()
  await page.getByRole('button', { name: '切换组件', exact: true }).click()
  expect(await shortcut(page)).toBe(true)
  expect(errors).toEqual([])
})

test('已卸载加载失败不弹旧提示，当前实例失败仍可重试', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/shell-component-lifecycle.html?mode=global')
  await expect.poll(() => shortcut(page)).toBe(false)
  await page.getByRole('button', { name: '切换组件', exact: true }).click()
  await page.getByRole('button', { name: '加载失败', exact: true }).click()
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  await expect(page.getByText('全局搜索加载失败，请稍后重试', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '切换组件', exact: true }).click()
  await expect.poll(() => shortcut(page)).toBe(false)
  await page.getByRole('button', { name: '加载失败', exact: true }).click()
  await expect(page.getByText('全局搜索加载失败，请稍后重试', { exact: true })).toBeVisible()
  expect(await shortcut(page)).toBe(false)
  await expect(page.getByLabel('加载次数')).toHaveText('3')
  await page.getByRole('button', { name: '完成组件加载', exact: true }).click()
  await expect(page.locator('.art-global-search-dialog')).toBeVisible()
})

async function stubNotifications(page: Page, time = '2026-10-09T12:34:56+08:00') {
  let requests = 0
  await page.route('**/rest/v1/**', (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/get_header_notification_center')) {
      requests++
      const json: Api.Notification.HeaderNotificationCenter = {
        notices: [
          {
            id: 'notice-test',
            category: 'notice',
            title: '流程处理通知',
            content: '流程处理结果将在通知中心显示。',
            severity: 'info',
            isRead: false,
            createdAt: time,
            routePath: '/notice-target',
            routeQuery: {}
          }
        ],
        messages: [],
        todos: [],
        unreadNoticeCount: 1,
        unreadMessageCount: 0,
        pendingTodoCount: 0,
        totalUnreadCount: 1
      }
      return route.fulfill({ json })
    }
    return route.fulfill({ json: [] })
  })
  return () => requests
}

for (const action of ['item', 'category']) {
  test(`通知已读请求结束前卸载，不再刷新或导航 ${action}`, async ({ page }) => {
    await prepareIsolatedSession(page)
    const requests = await stubNotifications(page)
    let pendingRead: Route | undefined
    await page.route('**/rest/v1/rpc/mark_header_notifications_read', (route) => {
      pendingRead = route
    })
    await page.goto('/tests/e2e/fixtures/shell-component-lifecycle.html?open=1')
    const panel = page.locator('.art-notification-panel')
    await expect(panel.getByText('流程处理通知', { exact: true })).toBeVisible()
    if (action === 'item') await panel.locator('.art-notification-panel__item').click()
    else await panel.getByRole('button', { name: '全部已读', exact: true }).click()
    await expect.poll(() => Boolean(pendingRead)).toBe(true)
    await page.getByRole('button', { name: '切换组件', exact: true }).click()
    const response = page.waitForResponse('**/rest/v1/rpc/mark_header_notifications_read')
    await pendingRead?.fulfill({ json: 1 })
    await response
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    )
    expect(requests()).toBe(1)
    await expect(page.getByLabel('当前路径')).toHaveText('/')
    await expect(panel).toHaveCount(0)
  })
}

for (const dispose of [false, true]) {
  test(`通知已读等待刷新时保留点击分类并检查卸载 ${dispose}`, async ({ page }) => {
    await prepareIsolatedSession(page)
    await stubNotifications(page)
    await page.clock.install()
    const initial = page.waitForResponse('**/rest/v1/rpc/get_header_notification_center')
    await page.goto('/tests/e2e/fixtures/shell-component-lifecycle.html?open=1')
    const center: Api.Notification.HeaderNotificationCenter = await (await initial).json()
    await expect(page.getByRole('button', { name: '切换组件', exact: true })).toBeVisible()
    await page.clock.runFor(300)
    const panel = page.locator('.art-notification-panel')
    await expect(panel.getByText('流程处理通知', { exact: true })).toBeVisible()
    let pendingRefresh: Route | undefined
    const categories: string[] = []
    await page.route('**/rest/v1/rpc/get_header_notification_center', (route) => {
      pendingRefresh = route
    })
    await page.route('**/rest/v1/rpc/mark_header_notifications_read', (route) => {
      categories.push(route.request().postDataJSON().p_category)
      return route.fulfill({ json: 1 })
    })
    await page.clock.runFor(60_000)
    await expect.poll(() => Boolean(pendingRefresh)).toBe(true)
    await panel.getByRole('button', { name: '全部已读', exact: true }).click()
    if (dispose) await page.getByRole('button', { name: '切换组件', exact: true }).click()
    else await panel.getByRole('tab', { name: '消息', exact: true }).click()
    const response = page.waitForResponse('**/rest/v1/rpc/get_header_notification_center')
    await pendingRefresh?.fulfill({ json: center })
    await response
    await page.clock.runFor(300)
    if (dispose) expect(categories).toEqual([])
    else await expect.poll(() => categories).toEqual(['notice'])
  })
}

test('通知仍挂载时正常标记已读并导航', async ({ page }) => {
  await prepareIsolatedSession(page)
  const requests = await stubNotifications(page)
  let notificationIds: string[] = []
  await page.route('**/rest/v1/rpc/mark_header_notifications_read', (route) => {
    notificationIds = route.request().postDataJSON().p_notification_ids
    return route.fulfill({ json: 1 })
  })
  await page.goto('/tests/e2e/fixtures/shell-component-lifecycle.html?open=1')
  const panel = page.locator('.art-notification-panel')
  await expect(panel.getByText('流程处理通知', { exact: true })).toBeVisible()
  await panel.locator('.art-notification-panel__item').click()
  await expect(page.getByLabel('当前路径')).toHaveText('/notice-target')
  await expect(panel).toBeHidden()
  expect(notificationIds).toEqual(['notice-test'])
  expect(requests()).toBe(2)
})

for (const theme of ['light', 'dark'])
  for (const box of ['border-mode', 'shadow-mode']) {
    test(`通知初始打开、快速重开和卸载清理 ${theme} ${box}`, async ({ page }, info) => {
      await prepareIsolatedSession(page)
      const requests = await stubNotifications(page)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.clock.install()
      await page.goto(
        `/tests/e2e/fixtures/shell-component-lifecycle.html?open=1&theme=${theme}&box=${box}`
      )
      const toggle = page.getByRole('button', { name: '切换组件', exact: true })
      await expect(toggle).toBeVisible()
      await page.clock.runFor(300)
      const panel = page.locator('.art-notification-panel')
      await expect(panel).toBeVisible()
      await expect(panel).toContainText('流程处理通知')
      await expect(panel.locator('time')).toHaveText('2026-10-09 12:34')
      await expect(page.getByLabel('未读数量')).toHaveText('1')
      await page.clock.runFor(31_000)
      expect(requests()).toBe(1)
      await page.getByRole('button', { name: '关闭通知', exact: true }).click()
      await page.clock.runFor(20)
      await page.getByRole('button', { name: '打开通知', exact: true }).click()
      await page.clock.runFor(300)
      await expect(panel).toBeVisible()
      await expect.poll(requests).toBe(2)
      await expect(panel).toContainText('流程处理通知')
      await expect(panel.locator('time')).toHaveText('2026-10-09 12:34')
      await page.clock.runFor(300)
      await expect(panel.getByText('流程处理通知', { exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
      await page.screenshot({ path: info.outputPath('notification.png') })
      await page.getByRole('button', { name: '关闭通知', exact: true }).click()
      await toggle.click()
      await page.clock.runFor(120_000)
      await expect(panel).toHaveCount(0)
      expect(requests()).toBe(2)
      expect(errors).toEqual([])
    })
  }

test('通知后台预取随组件卸载停止，重挂载恢复', async ({ page }) => {
  await prepareIsolatedSession(page)
  const requests = await stubNotifications(page)
  await page.clock.install()
  await page.goto('/tests/e2e/fixtures/shell-component-lifecycle.html')
  const toggle = page.getByRole('button', { name: '切换组件', exact: true })
  await expect(toggle).toBeVisible()
  await toggle.click()
  await page.clock.runFor(31_000)
  expect(requests()).toBe(0)
  await toggle.click()
  await page.clock.runFor(31_000)
  await expect.poll(requests).toBe(1)
  await toggle.click()
  await page.clock.runFor(120_000)
  expect(requests()).toBe(1)
})

for (const time of ['', 'invalid-date', '12:34']) {
  test('通知日期不泄露无效值或补出当天日期 ' + (time || 'empty'), async ({ page }) => {
    await prepareIsolatedSession(page)
    await stubNotifications(page, time)
    await page.clock.install()
    await page.goto('/tests/e2e/fixtures/shell-component-lifecycle.html?open=1')
    await expect(page.getByRole('button', { name: '切换组件', exact: true })).toBeVisible()
    await page.clock.runFor(300)
    await expect(page.locator('.art-notification-panel time')).toHaveText('--')
  })
}
