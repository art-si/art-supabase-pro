import { expect, test, type Page, type Request } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

interface MenuRpcPayload {
  p_parent_id: string | null
  p_root_only: boolean
}

interface MenuRpcRow {
  id: string
  parent_id: string | null
}

const isMenuRpcRequest = (request: Request): boolean =>
  request.method() === 'POST' && request.url().includes('/rest/v1/rpc/list_menu_management_nodes')

const readMenuRpcPayload = (request: Request): MenuRpcPayload =>
  request.postDataJSON() as MenuRpcPayload

async function readMenuRows(request: Request): Promise<MenuRpcRow[]> {
  const response = await request.response()
  expect(response, '菜单 RPC 应返回网络响应').not.toBeNull()
  expect(response?.ok(), `菜单 RPC 请求失败：${response?.status()}`).toBe(true)
  return (await response?.json()) as MenuRpcRow[]
}

async function waitForMenuTable(page: Page, rootCount: number): Promise<void> {
  await expect(page.getByRole('heading', { name: '菜单管理', exact: true })).toBeVisible({
    timeout: 60_000
  })
  await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0, { timeout: 60_000 })
  await expect(page.locator('.el-table__body-wrapper tbody tr')).toHaveCount(rootCount, {
    timeout: 60_000
  })
}

test('菜单管理首层与展开请求保持精简且层级正确', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const menuRequests: Request[] = []
  const legacyChildQueries: string[] = []

  page.on('request', (request) => {
    if (isMenuRpcRequest(request)) menuRequests.push(request)
    if (request.url().includes('/rest/v1/sys_menu') && request.url().includes('parent_id=in.')) {
      legacyChildQueries.push(request.url())
    }
  })

  const rootRequestPromise = page.waitForRequest(
    (request) => isMenuRpcRequest(request) && readMenuRpcPayload(request).p_root_only === true
  )
  await page.goto('#/system/menu', { waitUntil: 'domcontentloaded' })
  await expect(page).not.toHaveURL(/#\/auth\/login/)
  const rootRequest = await rootRequestPromise
  const rootRows = await readMenuRows(rootRequest)

  expect(readMenuRpcPayload(rootRequest)).toMatchObject({
    p_parent_id: null,
    p_root_only: true
  })
  expect(rootRows.length).toBeGreaterThan(0)
  expect(rootRows.every((row) => row.parent_id === null)).toBe(true)
  await waitForMenuTable(page, rootRows.length)

  const firstRoot = rootRows[0]
  const childRequestPromise = page.waitForRequest((request) => {
    if (!isMenuRpcRequest(request)) return false
    const payload = readMenuRpcPayload(request)
    return payload.p_parent_id === firstRoot.id && payload.p_root_only === false
  })

  await page
    .locator('.el-table__body-wrapper tbody tr')
    .first()
    .locator('.el-table__expand-icon')
    .click()
  const childRequest = await childRequestPromise
  const childRows = await readMenuRows(childRequest)

  expect(childRows.length).toBeGreaterThan(0)
  expect(childRows.every((row) => row.parent_id === firstRoot.id)).toBe(true)
  await expect(page.locator('.el-table__body-wrapper tbody tr')).toHaveCount(
    rootRows.length + childRows.length
  )
  expect(menuRequests).toHaveLength(2)
  expect(legacyChildQueries).toEqual([])

  // Exercise the real ancestor-query consumer without persisting any menu changes.
  const rows = page.locator('.el-table__body-wrapper tbody tr')
  const parentTitle = await rows.first().locator('.menu-identity-cell__heading strong').innerText()
  const childTitle = await rows.nth(1).locator('.menu-identity-cell__heading strong').innerText()
  await rows.nth(1).getByRole('button', { name: '查看详情', exact: true }).click()
  const breadcrumb = page.getByRole('navigation', { name: '菜单层级路径' })
  await expect(breadcrumb).toBeVisible()
  await expect(breadcrumb.locator(':scope > span')).toHaveText([parentTitle, childTitle])
  await expect(
    page.locator('.menu-detail__metrics article').filter({ hasText: '层级深度' }).locator('strong')
  ).toHaveText('2')
  await breadcrumb.screenshot({ path: testInfo.outputPath('menu-ancestor-path.png') })
  await page.keyboard.press('Escape')
  await expect(breadcrumb).toBeHidden()
})

test('菜单新增弹窗先显示，再加载完整菜单树', async ({ page }, testInfo) => {
  await page.goto('#/system/menu', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '菜单管理', exact: true })).toBeVisible({
    timeout: 60_000
  })
  const addButton = page.getByRole('button', { name: '添加菜单' })
  await expect(addButton).toBeEnabled()

  let releaseTree!: () => void
  const treeGate = new Promise<void>((resolve) => {
    releaseTree = resolve
  })
  await page.route('**/rest/v1/rpc/list_menu_management_nodes', async (route) => {
    const payload = readMenuRpcPayload(route.request())
    if (!payload.p_root_only && payload.p_parent_id === null) await treeGate
    await route.continue()
  })

  try {
    await addButton.click()
    const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新增菜单' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.art-overlay-loading.is-loading')).toBeVisible()
  } finally {
    releaseTree()
  }

  await expect(page.locator('.el-dialog:visible .art-overlay-loading.is-loading')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '创建菜单' })).toBeEnabled()
  await page.locator('.el-dialog:visible').screenshot({
    path: testInfo.outputPath('menu-add-dialog.png')
  })
})

test('菜单编辑弹窗先显示，再加载完整菜单树', async ({ page }) => {
  await page.goto('#/system/menu', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '菜单管理', exact: true })).toBeVisible({
    timeout: 60_000
  })

  let releaseTree!: () => void
  const treeGate = new Promise<void>((resolve) => {
    releaseTree = resolve
  })
  await page.route('**/rest/v1/rpc/list_menu_management_nodes', async (route) => {
    const payload = readMenuRpcPayload(route.request())
    if (!payload.p_root_only && payload.p_parent_id === null) await treeGate
    await route.continue()
  })

  try {
    await page
      .locator('.el-table__body-wrapper tbody tr')
      .first()
      .getByRole('button', { name: '更多操作' })
      .click()
    await page
      .locator('.el-dropdown-menu:visible .el-dropdown-menu__item')
      .filter({
        hasText: /^编辑/
      })
      .first()
      .click()
    const dialog = page.locator('.el-dialog:visible').filter({ hasText: /^编辑/ })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.art-overlay-loading.is-loading')).toBeVisible()
  } finally {
    releaseTree()
  }

  await expect(page.locator('.el-dialog:visible .art-overlay-loading.is-loading')).toHaveCount(0)
})

test.describe('菜单层级隔离只读集成', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('菜单详情和树形排序先显示，再加载完整菜单树', async ({ page }) => {
    test.setTimeout(90_000)
    const errors: string[] = []
    const writes: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await prepareIsolatedSession(page)
    const menus = [
      {
        id: 'lazy-system',
        parentId: null,
        name: 'LazySystem',
        path: '/system',
        component: '/index/index',
        type: 'folder',
        sort: 1,
        meta: { title: '测试系统', is_enable: true, roles: [] }
      },
      {
        id: 'lazy-menu',
        parentId: 'lazy-system',
        name: 'Menu',
        path: '/system/menu',
        component: '/system/menu',
        type: 'menu',
        sort: 1,
        meta: { title: '菜单管理', is_enable: true, roles: [] }
      },
      {
        id: 'lazy-menu-view',
        parentId: 'lazy-menu',
        name: 'System:Menu:View',
        path: '',
        type: 'button',
        sort: 1,
        meta: { title: '查看菜单', is_enable: true, roles: [] }
      },
      {
        id: 'lazy-menu-edit',
        parentId: 'lazy-menu',
        name: 'System:Menu:Edit',
        path: '',
        type: 'button',
        sort: 2,
        meta: { title: '编辑菜单', is_enable: true, roles: [] }
      },
      {
        id: 'lazy-other',
        parentId: null,
        name: 'LazyOther',
        path: '/system/role',
        component: '/system/role',
        type: 'menu',
        sort: 2,
        meta: { title: '独立验收入口', is_enable: true, roles: [] }
      }
    ]
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({ json: [{ code: 'platform', name: '测试平台', baseUrl: '/' }] })
    )
    await page.route('**/rest/v1/rpc/get_table_column_runtime', (route) =>
      route.fulfill({ json: { enabled: false, profiles: [] } })
    )
    await mockApplicationMenus(page, { platform: menus })
    const readonlyRpc = new Set([
      'current_is_super',
      'current_user_role_names',
      'get_login_default_language',
      'get_organization_list_secure',
      'material_unit_compatibility_options',
      'get_accessible_applications',
      'get_menus_for_current_applications',
      'get_current_user_button_permissions',
      'get_table_column_runtime',
      'get_note_cloud_settings',
      'list_menu_management_nodes'
    ])
    await page.route('**/rest/v1/**', (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (
        request.method() !== 'GET' &&
        !(path.includes('/rpc/') && readonlyRpc.has(path.split('/').at(-1) ?? ''))
      ) {
        writes.push(`${request.method()} ${path}`)
        return route.fulfill({ status: 403, json: { message: '此用例只允许读取菜单' } })
      }
      return route.fallback()
    })
    let fullTreeRequests = 0
    let treeGate = Promise.withResolvers<void>()
    await page.route('**/rest/v1/rpc/list_menu_management_nodes', async (route) => {
      expect(route.request().method()).toBe('POST')
      const payload = readMenuRpcPayload(route.request())
      if (!payload.p_root_only && payload.p_parent_id === null) {
        fullTreeRequests++
        await treeGate.promise
      }
      const rows = payload.p_root_only
        ? menus.filter((row) => row.parentId === null)
        : payload.p_parent_id
          ? menus.filter((row) => row.parentId === payload.p_parent_id)
          : menus
      await route.fulfill({
        json: rows.map((row) => ({
          ...row,
          hasChildren: menus.some((child) => child.parentId === row.id)
        }))
      })
    })
    try {
      await page.goto('#/system/menu', { waitUntil: 'domcontentloaded' })
      await expect(page).not.toHaveURL(/#\/auth\/login/)
      await waitForMenuTable(page, 2)
      await page
        .locator('.el-table__body-wrapper tbody tr')
        .first()
        .getByRole('button', { name: '查看详情' })
        .click()
      const drawer = page.locator('.el-drawer:visible')
      await expect(drawer).toBeVisible()
      await expect(drawer.locator('.art-overlay-loading.is-loading')).toBeVisible()
      await expect.poll(() => fullTreeRequests).toBe(1)
      treeGate.resolve()
      await expect(drawer.locator('.art-overlay-loading.is-loading')).toHaveCount(0)
      await expect(drawer.getByRole('navigation', { name: '菜单层级路径' })).toHaveText('测试系统')
      await page.keyboard.press('Escape')
      await expect(drawer).toBeHidden()

      treeGate = Promise.withResolvers<void>()
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitForMenuTable(page, 2)
      const sortButton = page.getByRole('button', { name: '树形排序', exact: true })
      await expect(sortButton).toBeEnabled()
      await sortButton.click()
      const dialog = page.locator('.el-dialog:visible').filter({ hasText: '树形拖拽排序' })
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('.art-overlay-loading.is-loading')).toBeVisible()
      await expect.poll(() => fullTreeRequests).toBe(2)
      treeGate.resolve()
      await expect(dialog.locator('.art-overlay-loading.is-loading')).toHaveCount(0)
      await expect(dialog.getByRole('tree')).toContainText('测试系统')
      await expect(dialog.getByRole('tree')).toContainText('独立验收入口')
      const filter = dialog.getByPlaceholder('搜索菜单名称或权限标识', { exact: true })
      await filter.fill('菜单管理')
      await expect(dialog.getByText('独立验收入口', { exact: true })).toBeHidden()
      await expect(dialog.getByRole('status')).toContainText('清空搜索后可拖拽排序')
      await page
        .locator('.menu-page')
        .evaluate((element) => element.setAttribute('data-cache-probe', 'same-parent'))
      await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click()
      await expect(dialog).toBeHidden()
      await sortButton.click()
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('.art-overlay-loading.is-loading')).toHaveCount(0)
      await expect(filter).toHaveValue('')
      await expect(dialog.getByText('独立验收入口', { exact: true })).toBeVisible()
      await expect(dialog.getByText('测试系统', { exact: true })).toBeVisible()
      await expect(dialog.getByRole('status')).toContainText('5 个节点可调整')
      await expect(page.locator('.menu-page')).toHaveAttribute('data-cache-probe', 'same-parent')
      expect(fullTreeRequests).toBe(2)
      expect(writes).toEqual([])
      expect(errors).toEqual([])
    } finally {
      treeGate.resolve()
    }
  })
})
