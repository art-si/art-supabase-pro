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
