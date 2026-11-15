import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeEach(async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'platform', name: '测试平台', baseUrl: '/' }] })
  )
  await page.route('**/rest/v1/rpc/get_table_column_runtime', (route) =>
    route.fulfill({ json: { enabled: false, profiles: [] } })
  )
  await mockApplicationMenus(page, {
    platform: [
      { path: '/dashboard/ai-operations', name: 'AiOperations', title: 'AI 运行监控' },
      { path: '/widgets/table-query', name: 'TableQueryWidget', title: '表格示例' },
      { path: '/system/user', name: 'User', title: '用户管理' }
    ].map(({ path, name, title }, sort) => ({
      id: name,
      parentId: null,
      name,
      path,
      component: path,
      type: 'menu',
      sort,
      meta: { title, is_enable: true, is_hide: false, roles: [] }
    }))
  })
})

test('AI 运行明细在非全高页面中显示表格，而不是空白区域', async ({ page }) => {
  test.setTimeout(120_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route(/\/rest\/v1\/rpc\/ai_(?:operations|quality_feedback)_overview$/, (route) =>
    route.fulfill({ json: null })
  )
  await page.route('**/rest/v1/ai_run?*', (route) =>
    route.fulfill({
      headers: { 'content-range': '0-0/1' },
      json: [{ id: 'layout-run', feature: 'test', status: 'succeeded', metadata: {} }]
    })
  )

  await page.goto('#/dashboard/ai-operations?section=runs', { waitUntil: 'domcontentloaded' })

  const table = page.locator('.ai-operations__table .el-table')
  await expect(table).toBeVisible({ timeout: 60_000 })
  await expect(table.getByRole('columnheader', { name: '功能场景' })).toBeVisible()
  await expect
    .poll(async () => table.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(200)
  expect(pageErrors).toEqual([])
})

test.describe('查询表格示例', () => {
  test('普通模式保留表格高度和行拖拽区域', async ({ page, isMobile }, testInfo) => {
    test.setTimeout(120_000)
    const path = '/widgets/table-query'
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`#${path}`, { waitUntil: 'domcontentloaded' })

    const widget = page.locator('.table-query-widget')
    const tables = widget.locator('.art-table-query .el-table')
    await expect(tables).toHaveCount(2, { timeout: 60_000 })
    for (const table of await tables.all()) {
      await expect
        .poll(() => table.evaluate((element) => element.getBoundingClientRect().height))
        .toBeGreaterThan(250)
    }

    const handles = tables.first().getByRole('button', { name: '拖拽排序', exact: true })
    const source = handles.nth(2)
    const target = handles.first()
    await source.click({ trial: true })
    await target.click({ trial: true })
    if (!isMobile) {
      const [from, to, sourceKey] = await Promise.all([
        source.boundingBox(),
        target.boundingBox(),
        source.getAttribute('data-row-key')
      ])
      if (!from || !to || !sourceKey) throw new Error('无法定位行拖拽按钮')

      const x = from.x + from.width / 2
      const y = from.y + from.height / 2
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x, y - 8, { steps: 5 })
      await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 20 })
      await page.mouse.up()
      await expect(widget.getByText(/row drag end -> \d+ to \d+/)).toHaveCount(1)
      await expect(handles.first()).toHaveAttribute('data-row-key', sourceKey)
    }
    expect(errors).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('normal-configured-table-height.png') })
  })
})

test('全高用户列表在共享表格布局调整后仍保持可见', async ({ page }) => {
  test.setTimeout(120_000)
  await page.route('**/rest/v1/sys_user?*', (route) => {
    const selection = new URL(route.request().url()).searchParams.get('select')
    if (!selection?.includes('organization:mdm_organization!')) return route.fallback()
    return route.fulfill({
      headers: { 'content-range': '0-0/1' },
      json: [{ id: 'layout-user', user_name: '表格布局用户', status: '1' }]
    })
  })
  await page.goto('#/system/user', { waitUntil: 'domcontentloaded' })

  const table = page.locator('.art-table-query .el-table').first()
  await expect(table).toBeVisible({ timeout: 60_000 })
  await expect(table.getByText('表格布局用户', { exact: true })).toBeVisible()
  expect(await table.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(
    80
  )
})
