import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('未配置外链时显示统一空状态并结束加载', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(
      '/tests/e2e/fixtures/route-entry-paths.html?component=/outside/iframe&empty-link'
    )
    await expect(page.getByText('未配置外部页面', { exact: true })).toBeVisible()
    await expect(
      page.getByText('请联系管理员完善当前菜单的页面链接。', { exact: true })
    ).toBeVisible()
    await expect(page.locator('iframe')).toHaveCount(0)
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `.artifacts/iframe-empty-${width}.png` })
  }
})

for (const nativeLoader of [false, true]) {
  test(`外链新入口通过${nativeLoader ? '专用' : '通用'}加载器加载目标页面`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(
      `/tests/e2e/fixtures/route-entry-paths.html?component=/outside/iframe${nativeLoader ? '&iframe-loader' : ''}`
    )
    const frame = page.frameLocator('iframe[title="外部业务页面"]')
    await expect(frame.getByRole('button', { name: '查询测试' })).toBeVisible()
    await page.getByRole('button', { name: '切换外链' }).click()
    await expect(frame.getByRole('button', { name: '查询公司' })).toBeVisible()
    expect(errors).toEqual([])
  })
}

for (const entry of [
  { component: '/examples/tables/basic', selector: '.el-table' },
  { component: '/examples/form/search-bar', text: '基础示例（默认收起）' },
  { component: '/tms/waybill-management/pending', text: '待调度运单' },
  { component: '/tms/waybill-management/loaded', text: '运输运单' },
  { component: '/tms/order-list/detail', text: '缺少订单标识' }
]) {
  test(`路由加载器解析迁移后的入口 ${entry.component}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.goto(
      `/tests/e2e/fixtures/route-entry-paths.html?component=${encodeURIComponent(entry.component)}`
    )
    if (entry.selector) await expect(page.locator(entry.selector).first()).toBeVisible()
    else await expect(page.getByText(entry.text!, { exact: true }).first()).toBeVisible()
    expect(errors).toEqual([])
  })
}
