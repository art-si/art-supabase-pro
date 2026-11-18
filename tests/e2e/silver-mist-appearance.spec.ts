import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 20_000 })

test('银雾工作台独立换肤，刷新保留并可切回各既有方案', async ({ page, isMobile }, info) => {
  test.setTimeout(300_000)
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'platform', name: '测试平台', baseUrl: '/' }] })
  )
  await mockApplicationMenus(page, {
    platform: [
      {
        id: 'silver-mist-users',
        parentId: null,
        name: 'User',
        path: '/system/user',
        component: '/system/user',
        type: 'menu',
        sort: 1,
        meta: { title: '用户管理', is_enable: true, is_hide: false, roles: [] }
      }
    ]
  })
  await page.route('**/rest/v1/sys_user?*', (route) => {
    const select = new URL(route.request().url()).searchParams.get('select')
    if (!select?.includes('organization:mdm_organization!')) return route.fallback()
    return route.fulfill({
      headers: { 'content-range': '0-1/2' },
      json: [
        { id: 'silver-mist-user-1', user_name: '周文青', user_nick_name: '运营组', status: '1' },
        { id: 'silver-mist-user-2', user_name: '林海', user_nick_name: '仓库调度', status: '0' }
      ]
    })
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('#/system/user', { waitUntil: 'domcontentloaded' })
  const html = page.locator('html')
  const table = page.locator('.art-table-query .el-table').first()
  const user = table.getByText('周文青', { exact: true })
  const open = page.getByRole('button', { name: '打开界面设置', exact: true })
  const close = page.getByRole('button', { name: '关闭界面设置', exact: true })
  const sidebarBackdrop = page.getByRole('button', { name: '切换侧边菜单', exact: true })
  const studio = page.locator('.smart-layout-presets')
  const silver = studio.getByRole('button', { name: /^银雾工作台/ })
  const aurora = studio.getByRole('button', { name: /^极光专注/ })
  const background = (locator: typeof studio) =>
    locator.evaluate((el) => getComputedStyle(el).backgroundImage)

  await expect(user).toBeVisible({ timeout: 120_000 })
  if (info.project.use.colorScheme === 'dark') await expect(html).toHaveClass(/\bdark\b/)
  else await expect(html).not.toHaveClass(/\bdark\b/)
  await open.click()
  if (!isMobile) {
    await aurora.click()
    await expect(page.getByText('已应用「极光专注」布局', { exact: true })).not.toBeVisible()
  }
  const standardStudio = await background(studio)
  expect(standardStudio).toContain('gradient')
  await page.screenshot({ path: info.outputPath('standard-studio.png') })
  await close.click()
  await expect(user).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: info.outputPath('standard-table.png') })

  await open.click()
  await silver.click()
  await expect(html).toHaveAttribute('data-workspace-appearance', 'silver-mist')
  await expect(html).toHaveCSS('--el-color-primary', '#0088FF')
  await expect(silver).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('已应用「银雾工作台」布局', { exact: true })).toHaveCount(0)
  await expect.poll(() => background(studio)).toBe('none')
  await expect(page.locator('.setting-modal .el-drawer')).toHaveCSS('background-image', 'none')
  await expect(user).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: info.outputPath('silver-mist-studio.png') })
  await close.click()
  await expect(studio).not.toBeVisible()
  if (isMobile) await expect(sidebarBackdrop).not.toBeVisible()
  await page.screenshot({ path: info.outputPath('silver-mist-table.png') })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(html).toHaveAttribute('data-workspace-appearance', 'silver-mist', {
    timeout: 60_000
  })
  await expect(html).toHaveCSS('--el-color-primary', '#0088FF')
  await open.click()
  await expect(silver).toHaveAttribute('aria-pressed', 'true')
  const fineTuning = page.getByRole('button', { name: /^精细配置/ })
  await fineTuning.click()
  await page.getByRole('button', { name: '阴影', exact: true }).click()
  await expect(html).toHaveAttribute('data-box-mode', 'shadow-mode')
  await expect(html).toHaveAttribute('data-workspace-appearance', 'silver-mist')
  await fineTuning.click()
  for (const name of ['极光专注', '数据指挥舱', '创意流动']) {
    await studio.getByRole('button', { name: new RegExp(`^${name}`) }).click()
    await expect(html).not.toHaveAttribute('data-workspace-appearance', 'silver-mist')
    await expect.poll(() => background(studio)).toContain('gradient')
    await silver.click()
    await expect(html).toHaveAttribute('data-workspace-appearance', 'silver-mist')
  }

  await fineTuning.click()
  await page.getByRole('button', { name: '重置配置' }).click()
  await expect(html).not.toHaveAttribute('data-workspace-appearance', 'silver-mist')
  expect(errors).toEqual([])
})

test('共享输入控件、下拉层和弹窗继承银雾皮肤', async ({ page }, info) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/box-mode-surfaces.html', {
    waitUntil: 'domcontentloaded'
  })
  const html = page.locator('html')
  const dark = info.project.use.colorScheme === 'dark'
  await page.getByRole('button', { name: dark ? '深色主题' : '浅色主题' }).click()
  await html.evaluate((element: HTMLElement) => {
    element.dataset.workspaceAppearance = 'silver-mist'
  })

  const select = page.getByRole('combobox', { name: '选择状态' })
  await select.press('ArrowDown')
  const popup = page.locator('.el-select__popper:visible')
  await expect(popup).toHaveCSS('background-color', dark ? 'rgb(43, 43, 46)' : 'rgb(255, 255, 255)')
  await page.screenshot({ path: info.outputPath('silver-mist-select.png') })
  await popup.getByRole('option', { name: '启用', exact: true }).click()

  const opener = page.getByRole('button', { name: '打开弹窗', exact: true })
  await expect(opener).toHaveCSS('color', dark ? 'rgb(240, 240, 242)' : 'rgb(34, 34, 37)')
  await opener.click()
  const dialog = page.getByRole('dialog', { name: '测试弹窗' })
  const dialogSurface = dialog.locator('.el-dialog')
  await expect(dialogSurface).toHaveCSS(
    'background-color',
    dark ? 'rgb(43, 43, 46)' : 'rgb(255, 255, 255)'
  )
  await page.screenshot({ path: info.outputPath('silver-mist-dialog.png'), animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(opener).toBeFocused()
})

test('银雾亮色自定义强调色下，主要按钮文字在普通和悬停状态清晰可辨', async ({
  page,
  hasTouch
}, info) => {
  await page.goto(
    `/tests/e2e/fixtures/silver-mist-native.html?theme=${info.project.use.colorScheme ?? 'light'}`
  )
  const button = page.getByRole('button', { name: '打开对话框', exact: true })
  await expect(button).toBeVisible({ timeout: 60_000 })

  const contrast = () =>
    button.evaluate((element) => {
      const styles = getComputedStyle(element)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const context = canvas.getContext('2d', { willReadFrequently: true })!
      const luminance = (cssColor: string) => {
        context.fillStyle = cssColor
        context.fillRect(0, 0, 1, 1)
        const [r, g, b] = Array.from(context.getImageData(0, 0, 1, 1).data, (value) => {
          const channel = value / 255
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
        })
        return r * 0.2126 + g * 0.7152 + b * 0.0722
      }
      const foreground = luminance(styles.color)
      const background = luminance(styles.backgroundColor)
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
    })

  for (const accent of ['#087bff', '#10b981', '#06b6d4', '#ff8a00']) {
    await page.mouse.move(0, 0)
    await page.locator('html').evaluate((html, primary) => {
      html.style.setProperty('--el-color-primary', primary)
    }, accent)
    expect(await contrast(), `${accent} 普通状态`).toBeGreaterThanOrEqual(4.5)
    if (!hasTouch) {
      await button.hover()
      expect(await contrast(), `${accent} 悬停状态`).toBeGreaterThanOrEqual(4.5)
    }
  }
})
