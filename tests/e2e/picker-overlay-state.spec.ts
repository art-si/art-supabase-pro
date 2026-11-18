import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)

test('资源选择器跟随外部关闭并能再次打开', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/picker-overlay-state.html?mode=resource')
  const dialog = page.getByRole('dialog', { name: '资源选择器' })
  await page.getByRole('button', { name: '打开选择器' }).click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('F8')
  await expect(dialog).toBeHidden()
  await expect(page.getByLabel('外部显示状态')).toHaveText('false')
  await page.getByRole('button', { name: '打开选择器' }).click()
  await expect(dialog).toBeVisible()
  const search = dialog.getByPlaceholder('搜索此分类下的资源')
  await search.fill('全屏切换保留资源搜索')
  await dialog.getByRole('button', { name: '全屏', exact: true }).click()
  await expect(dialog.locator('.el-dialog')).toHaveClass(/(?:^|\s)is-fullscreen(?:\s|$)/)
  await expect(search).toHaveValue('全屏切换保留资源搜索')
  await page.screenshot({ path: info.outputPath('resource-fullscreen.png') })
  await dialog.getByRole('button', { name: '退出全屏', exact: true }).click()
  await expect(search).toHaveValue('全屏切换保留资源搜索')
  await page.screenshot({ path: info.outputPath('resource-reopened.png') })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByLabel('外部显示状态')).toHaveText('false')
  expect(errors).toEqual([])
})

test('资源选择器菜单拖动前后定位到真实指针，Escape 关菜单并回焦', async ({
  page,
  isMobile
}, info) => {
  test.skip(isMobile, '该回归验证桌面指针右键和标题拖动')
  await prepareIsolatedSession(page)
  const viewport = { width: 1440, height: 900 }
  await page.setViewportSize(viewport)
  const fileName = '菜单定位资料.pdf'
  const writes: string[] = []
  await page.route(/\/rest\/v1\/sys_attachment(?:\?|$)/, (route) => {
    if (route.request().method() !== 'GET') {
      writes.push(route.request().method())
      return route.abort('blockedbyclient')
    }
    const query = new URL(route.request().url()).searchParams
    expect(query.get('tenant_id')).toBe('eq.test-tenant')
    expect(query.get('suffix')).toContain('pdf')
    return route.fulfill({
      json: [
        {
          id: '11111111-1111-4111-8111-111111111149',
          tenant_id: 'test-tenant',
          origin_name: fileName,
          suffix: 'pdf',
          size: 512,
          url: '/__test/resource-menu.pdf',
          create_time: '2026-11-16T03:00:00Z'
        }
      ],
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  })
  await page.goto('/tests/e2e/fixtures/picker-overlay-state.html?mode=resource&menu-read')
  await page.getByRole('button', { name: '打开选择器', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '资源选择器', exact: true })
  const dialogSurface = dialog.locator('.el-dialog')
  const trigger = dialog.getByRole('button', { name: `选择资源 ${fileName}`, exact: true })
  const menu = page.locator('.menu-right:visible')
  await expect(trigger).toBeVisible()

  const checkMenu = async (afterDrag = false) => {
    await trigger.focus()
    const button = await trigger.boundingBox()
    if (!button) throw new Error('找不到资源按钮的实际位置')
    const point = { x: button.x + button.width / 2, y: button.y + button.height / 2 }
    await page.mouse.click(point.x, point.y, { button: 'right' })
    await expect(menu.getByRole('menuitem', { name: '选中', exact: true })).toBeFocused()
    await expect
      .poll(async () => {
        const box = await menu.boundingBox()
        return box ? Math.max(Math.abs(box.x - point.x), Math.abs(box.y - point.y)) : Infinity
      })
      .toBeLessThanOrEqual(2)
    if (afterDrag) {
      await page.screenshot({
        path: info.outputPath('resource-context-menu-dragged.png'),
        animations: 'disabled'
      })
    }
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(dialog).toBeVisible()
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute('aria-pressed', 'false')
  }

  await checkMenu()
  await expect(dialogSurface).toHaveClass(/\bis-draggable\b/)
  const before = await dialogSurface.boundingBox()
  const header = await dialogSurface.locator('.el-dialog__header').boundingBox()
  if (!before || !header) throw new Error('找不到可拖动弹窗的标题栏')
  await page.mouse.move(header.x + 100, header.y + 20)
  await page.mouse.down()
  await page.mouse.move(header.x + 170, header.y + 45, { steps: 6 })
  await page.mouse.up()
  await expect
    .poll(async () => (await dialogSurface.boundingBox())?.x ?? before.x)
    .toBeGreaterThan(before.x + 40)
  await checkMenu(true)
  expect(writes).toEqual([])
})

test('地址地图在可见窗口缩放和全屏切换后重新计算尺寸', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    class Map {
      constructor(private container: HTMLElement) {
        container.textContent = '地图 SDK 测试画布'
        document.documentElement.dataset.mapInitializations = String(
          Number(document.documentElement.dataset.mapInitializations || 0) + 1
        )
      }
      addControl() {}
      on() {}
      resize() {
        document.documentElement.dataset.mapResizeCalls = String(
          Number(document.documentElement.dataset.mapResizeCalls || 0) + 1
        )
      }
      destroy() {
        this.container.textContent = ''
      }
    }
    class Service {
      clear() {}
    }
    Object.defineProperty(window, 'AMap', {
      value: {
        Map,
        PlaceSearch: Service,
        AutoComplete: Service,
        DistrictSearch: Service,
        Geocoder: Service,
        Scale: Service,
        ToolBar: Service
      }
    })
  })
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/picker-overlay-state.html?mode=address')
  await page.getByRole('button', { name: '打开选择器' }).click()
  const dialog = page.getByRole('dialog', { name: '选择地址' })
  const resizeCount = () =>
    page.evaluate(() => Number(document.documentElement.dataset.mapResizeCalls || 0))
  await expect.poll(resizeCount).toBeGreaterThan(0)
  const initializations = await page.evaluate(
    () => document.documentElement.dataset.mapInitializations
  )
  const beforeResize = await resizeCount()
  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  await expect.poll(resizeCount).toBeGreaterThan(beforeResize)
  const beforeVisualResize = await resizeCount()
  await page.evaluate(() => window.visualViewport?.dispatchEvent(new Event('resize')))
  await expect.poll(resizeCount).toBeGreaterThan(beforeVisualResize)
  await dialog.screenshot({ path: info.outputPath('address-resized.png') })
  const beforeFullscreen = await resizeCount()
  await dialog.getByRole('button', { name: '全屏', exact: true }).click()
  await expect(dialog.locator('.el-dialog')).toHaveClass(/(?:^|\s)is-fullscreen(?:\s|$)/)
  await expect.poll(resizeCount).toBeGreaterThan(beforeFullscreen)
  await expect
    .poll(async () => (await dialog.locator('.art-address-picker-map').boundingBox())?.height || 0)
    .toBeGreaterThan(300)
  await expect(dialog.getByPlaceholder('搜索地点、园区、道路、仓库名称')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.dataset.mapInitializations)).toBe(
    initializations
  )
  await dialog.screenshot({ path: info.outputPath('address-fullscreen.png') })
  await dialog.getByRole('button', { name: '退出全屏', exact: true }).click()
  await expect(dialog.locator('.el-dialog')).not.toHaveClass(/(?:^|\s)is-fullscreen(?:\s|$)/)
  expect(await page.evaluate(() => document.documentElement.dataset.mapInitializations)).toBe(
    initializations
  )
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  const closedCount = await resizeCount()
  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  expect(await resizeCount()).toBe(closedCount)
  expect(errors).toEqual([])
})
