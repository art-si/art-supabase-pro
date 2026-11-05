import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

const menuRow = {
  id: 'menu-refresh-fixture',
  parentId: null,
  name: 'MenuRefreshFixture',
  path: '/system/menu',
  component: '/system/menu/index',
  sort: 1,
  type: 'menu',
  hasChildren: false,
  meta: { title: '菜单刷新验收', isEnable: true }
}

async function mockMenuRows(page: Page): Promise<void> {
  await page.route('**/rest/v1/rpc/list_menu_management_nodes', (route) =>
    route.fulfill({ status: 200, json: [menuRow] })
  )
}

async function openFirstMenuEditor(page: Page): Promise<void> {
  await page.goto('/tests/e2e/fixtures/menu-navigation-refresh.html', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByRole('heading', { name: '菜单管理', exact: true })).toBeVisible({
    timeout: 60_000
  })
  await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0, { timeout: 60_000 })
  const completeTree = page.waitForResponse((response) => {
    if (!response.url().includes('/rest/v1/rpc/list_menu_management_nodes')) return false
    const payload = response.request().postDataJSON() as { p_root_only?: boolean }
    return payload.p_root_only === false
  })
  await page
    .locator('.el-table__body-wrapper tbody tr')
    .first()
    .getByRole('button', { name: '更多操作' })
    .click()
  await page
    .locator('.el-dropdown-menu:visible .el-dropdown-menu__item')
    .filter({ hasText: /^编辑/ })
    .first()
    .click()
  await completeTree
  await expect(page.locator('.el-dialog:visible .art-overlay-loading.is-loading')).toHaveCount(0, {
    timeout: 60_000
  })
  const dialog = page.locator('.el-dialog:visible')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: '* 菜单名称' })).toHaveValue('菜单刷新验收')
  await expect(dialog.getByRole('button', { name: '保存修改', exact: true })).toBeEnabled()
}

test('菜单保存成功后重新加载导航和动态路由', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  let documentNavigations = 0
  let menuLoads = 0
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) documentNavigations += 1
  })
  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/rpc/list_menu_management_nodes')) menuLoads += 1
  })

  await mockMenuRows(page)
  await openFirstMenuEditor(page)
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    const dialog = page.locator('.el-dialog:visible')
    await expect(dialog).toBeVisible()
    const hasHorizontalOverflow = await dialog.evaluate(
      (element) => element.scrollWidth > element.clientWidth
    )
    expect(hasHorizontalOverflow, `${width}px 的菜单编辑弹窗不应横向溢出`).toBe(false)
    await dialog.screenshot({ path: testInfo.outputPath(`menu-edit-${width}.png`) })
  }
  const previousNavigations = documentNavigations
  const previousMenuLoads = menuLoads
  expect(previousMenuLoads).toBeGreaterThan(0)

  // 菜单写入全部拦截，验证刷新行为而不改动真实业务数据。
  await page.route('**/rest/v1/sys_menu?*', (route) => {
    if (route.request().method() !== 'PATCH') return route.continue()
    return route.fulfill({
      status: 204,
      headers: {
        'content-range': '*/1',
        'access-control-expose-headers': 'content-range'
      },
      body: ''
    })
  })

  const saveRequest = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().includes('/rest/v1/sys_menu')
  )
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await saveRequest
  await expect.poll(() => documentNavigations).toBeGreaterThan(previousNavigations)
  await expect.poll(() => menuLoads, { timeout: 60_000 }).toBeGreaterThan(previousMenuLoads)
  await expect(page.getByRole('heading', { name: '菜单管理', exact: true })).toBeVisible()
})

test('菜单保存失败时保留编辑弹窗和当前导航', async ({ page }) => {
  test.setTimeout(120_000)
  let documentNavigations = 0
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) documentNavigations += 1
  })

  await mockMenuRows(page)
  await openFirstMenuEditor(page)
  const previousNavigations = documentNavigations
  await page.route('**/rest/v1/sys_menu?*', (route) => {
    if (route.request().method() !== 'PATCH') return route.continue()
    return route.fulfill({
      status: 403,
      json: { code: '42501', message: 'permission denied' }
    })
  })

  const rejectedSave = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      response.url().includes('/rest/v1/sys_menu') &&
      response.status() === 403
  )
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await rejectedSave
  await expect(page.locator('.el-dialog:visible')).toBeVisible()
  await expect(page.getByRole('button', { name: '保存修改', exact: true })).toBeEnabled()
  expect(documentNavigations).toBe(previousNavigations)
})
