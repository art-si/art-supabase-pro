import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })

const presets = [
  { id: 'aurora', name: '极光专注', color: '#635BFF' },
  { id: 'command', name: '数据指挥舱', color: '#087BFF' },
  { id: 'studio', name: '创意流动', color: '#EC4899' }
] as const

async function prepareUserManagement(page: Page) {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'platform', name: '业务工作台', baseUrl: '/' }] })
  )
  await mockApplicationMenus(page, {
    platform: [
      {
        id: 'layout-system',
        parentId: null,
        name: 'System',
        path: '/system',
        component: '/index/index',
        type: 'folder',
        sort: 1,
        meta: { title: '系统管理', icon: 'ri:settings-3-line', is_enable: true, roles: [] }
      },
      {
        id: 'layout-users',
        parentId: 'layout-system',
        name: 'User',
        path: '/system/user',
        component: '/system/user',
        type: 'menu',
        sort: 1,
        meta: { title: '用户管理', icon: 'ri:user-line', is_enable: true, roles: [] }
      },
      {
        id: 'layout-roles',
        parentId: 'layout-system',
        name: 'Role',
        path: '/system/role',
        component: '/system/role',
        type: 'menu',
        sort: 2,
        meta: { title: '角色管理', icon: 'ri:shield-user-line', is_enable: true, roles: [] }
      },
      {
        id: 'layout-tools',
        parentId: null,
        name: 'LayoutTools',
        path: '/management-tools',
        component: '/index/index',
        type: 'folder',
        sort: 2,
        meta: { title: '管理工具', icon: 'ri:tools-line', is_enable: true, roles: [] }
      },
      {
        id: 'layout-menu',
        parentId: 'layout-tools',
        name: 'Menu',
        path: '/system/menu',
        component: '/system/menu',
        type: 'menu',
        sort: 1,
        meta: { title: '菜单管理', icon: 'ri:menu-line', is_enable: true, roles: [] }
      }
    ]
  })
  await page.route('**/rest/v1/sys_user?*', (route) => {
    const select = new URL(route.request().url()).searchParams.get('select')
    if (!select?.includes('organization:mdm_organization!')) return route.fallback()
    return route.fulfill({
      headers: {
        'content-range': '0-1/2',
        'access-control-expose-headers': 'Content-Range'
      },
      json: [
        { id: 'layout-user-1', user_name: '周文青', user_nick_name: '运营组', status: '1' },
        { id: 'layout-user-2', user_name: '林海', user_nick_name: '仓库调度', status: '0' }
      ]
    })
  })
}

test('三套工作台预设在窄屏可选，宽屏恢复各自的业务导航', async ({ page }, info) => {
  test.setTimeout(240_000)
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await prepareAppearance(page, { theme, boxBorderMode: true })
  await prepareUserManagement(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const width = 320
  await page.setViewportSize({ width, height: 760 })
  await page.goto('#/system/user', { waitUntil: 'domcontentloaded' })
  const html = page.locator('html')
  const sidebar = page.locator('#app-sidebar')
  const sideToggle = page.getByRole('button', { name: '展开或收起侧边菜单', exact: true })
  const mixedNav = page.locator('.art-mixed-menu')
  const dualNav = sidebar.locator('.dual-menu-left')
  const table = page.locator('.art-table-query .el-table')
  const user = table.getByText('周文青', { exact: true })
  const openStudio = page.getByRole('button', { name: '打开界面设置', exact: true })
  const closeStudio = page.getByRole('button', { name: '关闭界面设置', exact: true })
  const studio = page.locator('.smart-layout-presets')
  const appMain = page.locator('#app-main')

  await expect(user).toBeVisible({ timeout: 90_000 })
  if (theme === 'dark') await expect(html).toHaveClass(/\bdark\b/)
  else await expect(html).not.toHaveClass(/\bdark\b/)

  // Each mobile selection overrides the previously remembered desktop layout.
  for (const preset of [presets[1], presets[2], presets[0]]) {
    await page.setViewportSize({ width, height: 760 })
    await openStudio.click()
    const card = studio.getByRole('button', { name: new RegExp(`^${preset.name}`) })
    await card.click()
    await expect(html).toHaveCSS('--el-color-primary', preset.color)
    await expect(card).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText(`已应用「${preset.name}」布局`, { exact: true })).toBeHidden()
    if (preset.id === 'command') {
      const allDescriptionsFit = await studio
        .locator('button small')
        .evaluateAll((items) => items.every((item) => item.scrollWidth <= item.clientWidth))
      expect(allDescriptionsFit).toBe(true)
      await page.screenshot({ path: info.outputPath('preset-selector-320.png') })
    }
    await closeStudio.click()
    await expect(user).toBeVisible()
    await page.screenshot({ path: info.outputPath(`${preset.id}-320.png`) })
    await expect(sidebar.locator('.menu-left')).toBeHidden()
    await expect(mixedNav).toBeHidden()
    await expect(dualNav).toBeHidden()
    await expect.poll(() => appMain.evaluate((element) => element.clientWidth)).toBe(width)
    await sideToggle.click()
    await expect(sidebar.getByText('系统管理', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '切换侧边菜单', exact: true }).click({
      position: { x: 310, y: 90 }
    })
    await expect(sidebar.locator('.menu-left')).toBeHidden()

    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(user).toBeVisible()
    if (preset.id === 'command') await expect(mixedNav).toBeVisible()
    else await expect(mixedNav).toBeHidden()
    if (preset.id === 'studio') {
      await expect(dualNav).toBeVisible()
      const collapse = sidebar.getByRole('button', { name: '收起侧边菜单', exact: true })
      const expand = sidebar.getByRole('button', { name: '展开侧边菜单', exact: true })
      await collapse.click()
      await expect(expand).toHaveAttribute('aria-expanded', 'false')
      await expand.press('Enter')
      await expect(collapse).toHaveAttribute('aria-expanded', 'true')
    } else {
      await expect(dualNav).toBeHidden()
    }
    await expect(sidebar.getByText('角色管理', { exact: true })).toBeVisible()
    await expect
      .poll(() => appMain.evaluate((element) => element.clientWidth))
      .toBeGreaterThan(1100)
    await expect(page.locator('.el-pagination__total')).toHaveText(/\b2\b/)
    await page.screenshot({ path: info.outputPath(`${preset.id}-1440.png`) })

    if (preset.id === 'studio') {
      const tableScroll = table.locator('.el-table__body-wrapper .el-scrollbar__wrap')
      await tableScroll.hover()
      await page.mouse.wheel(450, 0)
      await expect
        .poll(() => tableScroll.evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(0)
      await page.screenshot({ path: info.outputPath('studio-table-scrolled-1440.png') })
      await page.mouse.wheel(-450, 0)
    }

    await page.locator('.el-pagination__sizes').getByText('20条/页', { exact: true }).click()
    await expect(page.getByRole('option', { name: '20条/页', exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`${preset.id}-pagination-1440.png`) })
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: '新增用户', exact: true }).first().click()
    const editor = page.getByRole('dialog', { name: '新增用户', exact: true })
    await expect(editor.getByPlaceholder('请输入用户名')).toBeVisible()
    await page.screenshot({ path: info.outputPath(`${preset.id}-editor-1440.png`) })
    await editor.getByRole('button', { name: '关闭弹窗', exact: true }).click()

    await user.click()
    const detail = page.getByRole('dialog', { name: '用户详情', exact: true })
    await expect(detail).toBeVisible()
    await page.screenshot({ path: info.outputPath(`${preset.id}-detail-1440.png`) })
    await detail.getByRole('button', { name: '关闭抽屉', exact: true }).click()
  }

  expect(errors).toEqual([])
})

test('中等宽度保持工作台导航偏好，窄屏可正确复制与重置', async ({ page }, info) => {
  test.setTimeout(240_000)
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.emulateMedia({ colorScheme: theme })
  await prepareUserManagement(page)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.setViewportSize({ width: 768, height: 900 })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  const table = page.locator('.art-table-query .el-table')
  const user = table.getByText('周文青', { exact: true })
  const settingsButton = page.getByRole('button', { name: '打开界面设置', exact: true })
  const closeSettings = page.getByRole('button', { name: '关闭界面设置', exact: true })
  const appSwitcher = page.getByRole('button', { name: '切换业务应用', exact: true })
  const focusToggle = page.getByRole('button', { name: /自动专注浏览/ })
  const studio = page.locator('.smart-layout-presets')
  const mixedNav = page.locator('.art-mixed-menu')
  const sidebar = page.locator('#app-sidebar')
  const dualNav = sidebar.locator('.dual-menu-left')
  const manual = page.getByRole('button', { name: /精细配置/ })
  const expandSettings = async () => {
    await settingsButton.click()
    if ((await manual.getAttribute('aria-expanded')) !== 'true') await manual.click()
  }
  const card = (name: string) => studio.getByRole('button', { name: new RegExp(`^${name}`) })
  const assertHeaderHitTargets = async (menuItem?: Locator) => {
    const buttons = menuItem
      ? [settingsButton, appSwitcher, menuItem]
      : [settingsButton, appSwitcher]
    if (await focusToggle.count()) buttons.push(focusToggle)
    for (const button of buttons) {
      await expect(button).toBeVisible()
      const label = (await button.getAttribute('aria-label')) ?? (await button.innerText())
      await expect
        .poll(
          () =>
            button.evaluate((el) => {
              const box = el.getBoundingClientRect()
              if (box.left < 0 || box.right > innerWidth) return false
              return [box.left + 2, box.left + box.width / 2, box.right - 2].every((x) =>
                el.contains(document.elementFromPoint(x, box.top + box.height / 2))
              )
            }),
          { message: `${label} at ${page.viewportSize()?.width}px must be reachable` }
        )
        .toBe(true)
    }
  }

  await page.goto('#/system/user', { waitUntil: 'domcontentloaded' })
  await expect(user).toBeVisible({ timeout: 90_000 })
  if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  for (const preset of presets) {
    await page.setViewportSize({ width: 768, height: 900 })
    await settingsButton.click()
    await expect(studio).toBeVisible({ timeout: 45_000 })
    await card(preset.name).click()
    await expect(card(preset.name)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText(`已应用「${preset.name}」布局`, { exact: true })).toBeHidden()
    await closeSettings.click()
    await expect(studio).toBeHidden()
    await expect(sidebar.locator('.menu-left')).toBeHidden()
    await expect(mixedNav).toBeHidden()
    await expect(dualNav).toBeHidden()
    await assertHeaderHitTargets()
    await page.screenshot({ path: info.outputPath(`${preset.id}-768.png`) })

    await page.setViewportSize({ width: 1024, height: 900 })
    await expect(sidebar.getByText('角色管理', { exact: true })).toBeVisible()
    if (preset.id === 'command') await expect(mixedNav).toBeVisible()
    else await expect(mixedNav).toBeHidden()
    if (preset.id === 'studio') await expect(dualNav).toBeVisible()
    else await expect(dualNav).toBeHidden()
    await assertHeaderHitTargets(
      preset.id === 'command'
        ? mixedNav.getByRole('button', { name: '系统管理', exact: true })
        : undefined
    )
    await page.screenshot({ path: info.outputPath(`${preset.id}-1024.png`) })

    if (preset.id === 'command') {
      const system = mixedNav.getByRole('button', { name: '系统管理', exact: true })
      const tools = mixedNav.getByRole('button', { name: '管理工具', exact: true })
      const refresh = page.getByRole('button', { name: '刷新当前页面', exact: true })
      const centerY = (target: Locator) =>
        target.evaluate((el) => {
          const { top, height } = el.getBoundingClientRect()
          return top + height / 2
        })
      expect(Math.abs((await centerY(refresh)) - (await centerY(settingsButton)))).toBeLessThan(2)
      expect(await centerY(system)).toBeGreaterThan(await centerY(settingsButton))
      await expect(system).toHaveAttribute('aria-current', 'location')
      await tools.click()
      await expect(page).toHaveURL(/#\/system\/menu$/)
      await expect(tools).toHaveAttribute('aria-current', 'location')
      await page.screenshot({ path: info.outputPath('command-second-group-1024.png') })
      await system.press('Enter')
      await expect(page).toHaveURL(/#\/system\/user$/)
      await expect(user).toBeVisible()
    }
  }

  await page.setViewportSize({ width: 768, height: 900 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(user).toBeVisible({ timeout: 90_000 })
  await page.setViewportSize({ width: 1024, height: 900 })
  await expect(dualNav).toBeVisible()
  await page.setViewportSize({ width: 768, height: 900 })
  await expect(dualNav).toBeHidden()
  await expandSettings()
  await expect(card('创意流动')).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '复制配置', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('menuType: MenuTypeEnum.DUAL_MENU')

  await Promise.all([
    page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame()),
    page.getByRole('button', { name: '重置配置', exact: true }).click()
  ])
  await expect(user).toBeVisible({ timeout: 90_000 })
  await page.setViewportSize({ width: 1024, height: 900 })
  await expect(sidebar.getByText('角色管理', { exact: true })).toBeVisible()
  await expect(dualNav).toBeHidden()
  await page.screenshot({ path: info.outputPath('reset-1024.png') })

  const sidebarToggle = page.getByRole('button', { name: '展开或收起侧边菜单', exact: true })
  const sidebarWidth = () => sidebar.evaluate((el) => el.getBoundingClientRect().width)
  await sidebarToggle.click()
  await expect.poll(sidebarWidth).toBeLessThan(100)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(user).toBeVisible({ timeout: 90_000 })
  await expect.poll(sidebarWidth).toBeLessThan(100)
  expect(errors).toEqual([])
})
