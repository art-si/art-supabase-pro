import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('混合顶栏溢出时保留快捷按钮的宽度和菜单滚动入口', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  const dark = info.project.use.colorScheme === 'dark'
  const box = info.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
  await page.goto(
    `/tests/e2e/fixtures/shell-component-lifecycle.html?mode=header&mixed&theme=${dark ? 'dark' : 'light'}&box=${box}`
  )
  const header = page.locator('.art-header-bar')
  const menu = header.locator('.art-mixed-menu')
  const left = menu.getByRole('button', { name: '向左滚动菜单' })
  const right = menu.getByRole('button', { name: '向右滚动菜单' })
  await expect(menu).toBeVisible()
  await header.evaluate((element) => {
    element.style.width = 'calc(100% - 216px)'
  })

  for (const width of [1920, 1280, 1200, 1024, 801]) {
    await page.setViewportSize({ width, height: 760 })
    const buttons = ['刷新当前页面', /自动专注浏览/]
    if (width >= 1200) buttons.push('打开快捷入口')
    for (const name of buttons) {
      const button = header.getByRole('button', { name, exact: true })
      await expect(button).toHaveCSS('width', '34px')
      await button.click({ trial: true })
    }
    await expect(menu).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    if (width === 1280) {
      await expect(left).toBeDisabled()
      await expect(right).toBeEnabled()
      await expect(right).toHaveCSS('width', '30px')
      await right.click()
      await expect(left).toBeEnabled()
      await expect(left).toHaveCSS('width', '30px')
      await left.click()
      await expect(left).toBeDisabled()
      await header.screenshot({ path: info.outputPath('mixed-header-1280.png') })
    }
  }
})

test('顶部栏通知点击边界、引导计时与卸载后清理', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  const time = new Date('2026-10-10T01:00:00Z')
  await page.clock.install({ time })
  await page.clock.pauseAt(new Date('2026-10-10T02:00:00Z'))
  await page.goto('/tests/e2e/fixtures/shell-component-lifecycle.html?mode=header')
  const header = page.locator('.art-header-bar')
  await expect(header).toBeVisible()
  const guide = page.getByLabel('设置引导状态')
  await expect(guide).toHaveText('true')
  await page.getByRole('button', { name: '打开通知中心', exact: true }).click()
  await page.clock.runFor(20)
  const panel = page.locator('.art-notification-panel')
  await expect(panel).toBeVisible()
  await panel.click({ position: { x: 20, y: 20 } })
  await expect(panel).toBeVisible()
  await page.screenshot({ path: info.outputPath('header-notification.png'), fullPage: true })
  await page.getByLabel('当前路径').click()
  await page.clock.runFor(300)
  await expect(panel).toBeHidden()
  await page.getByRole('button', { name: '切换组件', exact: true }).click()
  await expect(header).toHaveCount(0)
  await page.clock.runFor(8000)
  await expect(guide).toHaveText('true')
  await page.getByRole('button', { name: '切换组件', exact: true }).click()
  await expect(header).toBeVisible()
  await page.clock.runFor(7999)
  await expect(guide).toHaveText('true')
  await page.clock.runFor(1)
  await expect(guide).toHaveText('false')
  await page.getByRole('button', { name: '打开通知中心', exact: true }).click()
  await page.clock.runFor(20)
  await expect(panel).toBeVisible()
  await page.getByLabel('当前路径').click()
  await page.clock.runFor(300)
  await expect(panel).toBeHidden()
})

test('顶部通知键盘打开后可切换分类并回到原按钮', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.setViewportSize({ width: 390, height: 680 })
  await page.goto('/tests/e2e/fixtures/shell-component-lifecycle.html?mode=header&theme=dark')
  const trigger = page.getByRole('button', { name: '打开通知中心', exact: true })
  await trigger.press('Enter')
  const panel = page.getByLabel('通知中心', { exact: true })
  const notice = panel.getByRole('tab', { name: '通知', exact: true })
  const message = panel.getByRole('tab', { name: '消息', exact: true })
  const todo = panel.getByRole('tab', { name: '待办', exact: true })
  await expect(notice).toBeFocused()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(message).toBeFocused()
  await expect(message).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByRole('tabpanel', { name: '消息', exact: true })).toBeVisible()
  await page.keyboard.press('End')
  await expect(todo).toBeFocused()
  await expect(panel.getByRole('button', { name: '进入审批工作台' })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await panel.screenshot({ path: info.outputPath('notification-tabs-390-dark.png') })
  await page.keyboard.press('Home')
  await expect(notice).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

test('短屏通知失败时重试按钮可点，键盘恢复后保留面板焦点', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  let reads = 0
  await page.route('**/rest/v1/rpc/get_header_notification_center', (route) =>
    ++reads === 1
      ? route.fulfill({ status: 503, json: { message: '通知服务暂时不可用' } })
      : route.fulfill({ json: [] })
  )
  await page.setViewportSize({ width: 320, height: 430 })
  await page.goto('/tests/e2e/fixtures/shell-component-lifecycle.html?mode=header')
  await page.getByRole('button', { name: '打开通知中心', exact: true }).press('Enter')
  const panel = page.getByLabel('通知中心', { exact: true })
  const tab = panel.getByRole('tab', { name: '通知', exact: true })
  const retry = panel.getByRole('button', { name: '重新加载', exact: true })
  await expect(retry).toBeInViewport({ ratio: 0.98 })
  await expect
    .poll(() =>
      retry.evaluate((button) => {
        const { left, top, width, height } = button.getBoundingClientRect()
        return button.contains(document.elementFromPoint(left + width / 2, top + height / 2))
      })
    )
    .toBe(true)
  await panel.screenshot({ path: info.outputPath('notification-retry-320.png') })
  await expect(tab).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(retry).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(panel.getByText('暂无通知', { exact: true })).toBeVisible()
  await expect(tab).toBeFocused()
  expect(reads).toBe(2)
})

for (const style of ['regular', 'background']) {
  test(`上级路径收起时保留当前标题与键盘入口 (${style})`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-1440')
    const dark = style === 'background'
    await page.goto(
      `/tests/e2e/fixtures/shell-component-lifecycle.html?mode=breadcrumb&style=${style}&theme=${dark ? 'dark' : 'light'}&box=${dark ? 'shadow-mode' : 'border-mode'}`
    )

    const breadcrumb = page.getByRole('navigation', { name: '当前位置' })
    const ancestors = breadcrumb.getByRole('button', { name: '查看上级路径' })
    const currentTitle = breadcrumb.locator('[aria-current="page"] .art-breadcrumb__label')
    await expect(ancestors).toBeVisible()
    await expect(ancestors.locator('svg')).toBeVisible()
    await expect(currentTitle).toHaveText('岗位安全责任制')
    expect(await currentTitle.evaluate((label) => label.scrollWidth <= label.clientWidth)).toBe(
      true
    )
    await breadcrumb.screenshot({ path: info.outputPath(`${style}-compact-path.png`) })

    await ancestors.press('Enter')
    const root = page.getByRole('menuitem', { name: '安全生产综合管理工作台' })
    await expect(root).toBeVisible()
    await expect(page.getByRole('menuitem', { name: '现场隐患整改与复核' })).toBeVisible()
    await root.press('Escape')
    await expect(root).toBeHidden()
    await expect(ancestors).toBeFocused()

    const frame = page.locator('#breadcrumb-fixture')
    await frame.evaluate((element) => (element.style.width = '760px'))
    await expect(ancestors).toHaveCount(0)
    await expect(breadcrumb.getByRole('button', { name: '现场隐患整改与复核' })).toBeVisible()

    await frame.evaluate((element) => (element.style.width = '270px'))
    await ancestors.press('Enter')
    const target = dark ? page.getByRole('menuitem', { name: '岗位安全生产责任考核' }) : root
    await target.press('Enter')
    await expect(page.getByLabel('当前路径')).toHaveText(
      dark ? '/breadcrumb-stable-detail' : '/breadcrumb/section-1'
    )
  })
}
