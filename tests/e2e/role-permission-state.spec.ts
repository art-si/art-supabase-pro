import { expect, test, type Page, type Route } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

const menuId = (index: number) => `permission-fixture-${index}`
const menus = [
  {
    id: 'permission-fixture-root',
    parent_id: null,
    name: 'PermissionFixture',
    type: 'folder',
    meta: { title: '测试权限目录' }
  },
  ...Array.from({ length: 1600 }, (_, index) => ({
    id: menuId(index),
    parent_id: 'permission-fixture-root',
    name: `PermissionFixture:${String(index).padStart(4, '0')}`,
    type: 'button',
    meta: { title: `测试操作 ${String(index).padStart(4, '0')}` }
  }))
]

async function prepare(page: Page, initialMenuIds: string[] = [menuId(0)]) {
  test.setTimeout(120_000)
  const tenant = await prepareIsolatedSession(page)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/rest/v1/sys_role?*', (route) =>
    route.fulfill({
      headers: { 'content-range': '0-1/2' },
      json: ['A', 'B'].map((label) => ({
        id: `permission-role-${label}`,
        role_name: `测试角色 ${label}`,
        role_code: `TEST_${label}`,
        tenant_id: tenant.id,
        tenant,
        enabled: true,
        description: '权限交互测试',
        organization_id: null
      }))
    })
  )
  const roleMenu = {
    id: 'permission-page',
    parentId: 'permission-system',
    type: 'menu',
    name: 'Role',
    path: 'role',
    component: '/system/role',
    meta: { title: '角色管理', is_enable: true },
    children: []
  }
  const systemMenu = {
    id: 'permission-system',
    parentId: null,
    type: 'folder',
    name: 'System',
    path: '/system',
    component: '/index/index',
    meta: { title: '系统管理', is_enable: true },
    children: [roleMenu]
  }
  await mockApplicationMenus(page, {
    platform: [{ ...systemMenu, children: undefined }, roleMenu]
  })
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [{ code: 'platform', name: '测试平台', baseUrl: '/', sort: 1 }]
    })
  )
  // Read the real page, but intercept every permission save before opening the
  // dialog. Test choices must never be persisted to any real role.
  const savedPayloads: Array<{ p_role_id: string; p_menu_ids: string[] }> = []
  await page.route('**/rest/v1/rpc/set_role_menus', async (route) => {
    savedPayloads.push(route.request().postDataJSON())
    await route.fulfill({
      status: 503,
      json: { code: 'TEST_UNAVAILABLE', message: '测试保存失败' }
    })
  })
  await page.goto('#/system/role', { waitUntil: 'domcontentloaded' })
  const openButtons = page.getByLabel('配置菜单权限', { exact: true })
  await expect(openButtons.first()).toBeVisible({ timeout: 60_000 })
  await page.evaluate(
    ({ dark, boxMode }) => {
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.dataset.boxMode = boxMode
    },
    {
      dark: test.info().project.name.includes('dark'),
      boxMode: test.info().project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
    }
  )
  await page.route('**/rest/v1/sys_menu?*', async (route) => {
    const query = new URL(route.request().url()).searchParams
    const offset = Number(query.get('offset') ?? 0)
    const limit = Number(query.get('limit') ?? 500)
    await route.fulfill({ json: menus.slice(offset, offset + limit) })
  })
  await page.route('**/rest/v1/sys_role_menu?*', (route) =>
    route.fulfill({ json: initialMenuIds.map((id) => ({ menu_id: id })) })
  )
  const dialog = page.getByRole('dialog', { name: '配置菜单权限', exact: true })
  const save = dialog.getByRole('button', { name: '保存权限', exact: true })
  const selected = dialog.locator('.role-permission-dialog__selection-count')
  const search = dialog.getByRole('textbox', { name: '搜索菜单、按钮或权限标识' })
  return { dialog, openButtons, save, selected, search, savedPayloads, pageErrors }
}

test('a selected child shows its ancestor as half checked without granting it on save', async ({
  page
}) => {
  const { dialog, openButtons, save, selected, savedPayloads, pageErrors } = await prepare(page)
  await openButtons.first().click()
  await expect(save).toBeEnabled({ timeout: 60_000 })
  await expect(selected).toHaveText('已选 1 / 1601 项')

  const rootCheckbox = dialog.locator('.el-tree-node').first().locator('label.el-checkbox')
  await expect(rootCheckbox.locator('.el-checkbox__input')).toHaveClass(/is-indeterminate/)
  await save.click()
  await expect.poll(() => savedPayloads.length).toBe(1)
  expect(savedPayloads[0].p_menu_ids).toEqual([menuId(0)])
  expect(pageErrors).toEqual([])
})

test('parent cascade changes only later parent actions and never normalizes loaded grants', async ({
  page
}) => {
  const { dialog, openButtons, save, selected, savedPayloads, pageErrors } = await prepare(page, [
    'permission-fixture-root'
  ])
  await openButtons.first().click()
  await expect(save).toBeEnabled({ timeout: 60_000 })
  await expect(selected).toHaveText('已选 1 / 1601 项')

  const cascade = dialog.locator('label.el-checkbox').filter({ hasText: '父级联动下级' })
  const root = dialog.locator('.el-tree-node').first().locator('label.el-checkbox')
  await cascade.click()
  await expect(selected).toHaveText('已选 1 / 1601 项')

  await save.click()
  await expect.poll(() => savedPayloads.length).toBe(1)
  expect(savedPayloads[0].p_menu_ids).toEqual(['permission-fixture-root'])

  await root.click()
  await expect(selected).toHaveText('已选 0 / 1601 项')
  await root.click()
  await expect(selected).toHaveText('已选 1601 / 1601 项')

  await cascade.click()
  await expect(selected).toHaveText('已选 1601 / 1601 项')
  expect(pageErrors).toEqual([])
})

test('large permission tree stays bounded through scrolling, search, collapse and reopen', async ({
  page
}, testInfo) => {
  const { dialog, openButtons, save, selected, search, savedPayloads, pageErrors } =
    await prepare(page)
  await openButtons.first().click()
  await expect(save).toBeEnabled({ timeout: 60_000 })
  await expect(selected).toHaveText('已选 1 / 1601 项')
  const viewport = dialog.locator('.role-permission-dialog__tree-viewport')
  const scroll = dialog.locator('.el-tree-virtual-list')
  const outer = dialog.locator('.art-dialog__scrollbar > .el-scrollbar__wrap')
  await dialog.evaluate(async (element) => {
    const animations = element
      .getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)))
  })
  const metrics = () =>
    viewport.evaluate((element) => ({
      height: element.clientHeight,
      top: element.getBoundingClientRect().top
    }))
  const initial = await metrics()
  expect(initial.height).toBeGreaterThan(180)
  // Several samples detect the observer/height feedback loop shown in the report.
  for (let sample = 0; sample < 4; sample += 1) {
    await page.waitForTimeout(150)
    expect(await metrics()).toEqual(initial)
    expect(await scroll.evaluate((element) => element.scrollTop)).toBe(0)
  }
  const fullHeight = await scroll.evaluate((element) => element.scrollHeight)
  await scroll.evaluate((element) => element.scrollTo(0, element.scrollHeight))
  await expect(dialog.getByText('测试操作 1599', { exact: true })).toBeVisible()
  await page.waitForTimeout(250)
  expect(await scroll.evaluate((element) => element.scrollHeight)).toBe(fullHeight)
  expect(await metrics()).toEqual(initial)
  expect(await outer.evaluate((element) => element.scrollTop)).toBe(0)
  await search.fill('PermissionFixture:1599')
  await expect(dialog.getByRole('status')).toHaveText('找到 1 个匹配项')
  await expect(dialog.getByText('测试操作 1599', { exact: true })).toBeVisible()
  await search.fill('找不到的测试权限')
  await expect(dialog.getByText('未找到匹配的菜单或按钮', { exact: true })).toBeVisible()
  await expect(selected).toHaveText('已选 1 / 1601 项')
  await dialog.screenshot({ path: testInfo.outputPath('permission-search-empty.png') })
  await dialog.getByRole('button', { name: '清空搜索', exact: true }).click()
  await expect(scroll).toBeVisible()
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0)
  await dialog.getByRole('button', { name: '全部展开', exact: true }).click()
  await dialog.getByRole('button', { name: '全部收起', exact: true }).click()
  await expect(dialog.locator('.el-tree-node')).toHaveCount(1)
  await dialog.getByRole('button', { name: '全部展开', exact: true }).click()
  await expect(dialog.getByText('测试操作 0000', { exact: true })).toBeVisible()
  await dialog.screenshot({ path: testInfo.outputPath('permission-tree.png') })
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  )
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await openButtons.first().click()
  await expect(save).toBeEnabled({ timeout: 60_000 })
  await expect(search).toHaveValue('')
  await expect(selected).toHaveText('已选 1 / 1601 项')
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0)
  expect(savedPayloads).toEqual([])
  expect(pageErrors).toEqual([])
})

test('failed or empty catalog cannot be saved; retry restores safe editing', async ({
  page
}, testInfo) => {
  const { dialog, openButtons, save, selected, search, savedPayloads, pageErrors } =
    await prepare(page)
  let fail = true
  let empty = false
  await page.route('**/rest/v1/sys_menu?*', async (route) => {
    if (fail)
      await route.fulfill({
        status: 503,
        json: { code: 'TEST_UNAVAILABLE', message: '测试加载失败' }
      })
    else if (empty) await route.fulfill({ json: [] })
    else await route.fallback()
  })
  await openButtons.first().click()
  await expect(dialog.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
  await expect(save).toBeDisabled()
  await expect(selected).toHaveText('权限未加载')
  await expect(search).toBeDisabled()
  await expect(dialog.getByRole('button', { name: '全部选择', exact: true })).toBeDisabled()
  await dialog.screenshot({ path: testInfo.outputPath('permission-error.png') })
  fail = false
  empty = true
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(dialog.getByText('暂无可配置的菜单权限', { exact: true })).toBeVisible()
  await expect(save).toBeDisabled()
  await dialog.screenshot({ path: testInfo.outputPath('permission-catalog-empty.png') })
  expect(savedPayloads).toEqual([])
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  empty = false
  await openButtons.first().click()
  await expect(save).toBeEnabled({ timeout: 60_000 })
  await expect(selected).toHaveText('已选 1 / 1601 项')
  // A valid loaded catalog still allows an intentional empty selection. Failure
  // must preserve this draft and permit retry, not pretend it was saved.
  await dialog.getByRole('button', { name: '全部选择', exact: true }).click()
  await expect(selected).toHaveText('已选 1601 / 1601 项')
  await dialog.getByRole('button', { name: '取消全选', exact: true }).click()
  await expect(selected).toHaveText('已选 0 / 1601 项')
  await save.click()
  await expect.poll(() => savedPayloads.length).toBe(1)
  await expect(save).toBeEnabled()
  await expect(dialog).toBeVisible()
  await expect(selected).toHaveText('已选 0 / 1601 项')
  expect(savedPayloads[0].p_menu_ids).toEqual([])
  expect(pageErrors).toEqual([])
})

for (const staleOutcome of ['success', 'failure'] as const) {
  test(`late ${staleOutcome} from a closed role cannot overwrite the newly opened role`, async ({
    page
  }) => {
    const { dialog, openButtons, save, selected, savedPayloads, pageErrors } = await prepare(page)
    let firstRequest: Route | undefined
    let received = 0
    await page.route('**/rest/v1/sys_role_menu?*', async (route) => {
      received += 1
      if (received === 1) firstRequest = route
      else await route.fulfill({ json: [{ menu_id: menuId(1) }, { menu_id: menuId(2) }] })
    })
    await openButtons.first().click()
    await expect.poll(() => Boolean(firstRequest)).toBe(true)
    await expect(save).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await openButtons.nth(1).click()
    await expect(save).toBeEnabled({ timeout: 60_000 })
    await expect(selected).toHaveText('已选 2 / 1601 项')
    if (!firstRequest) throw new Error('缺少待完成的旧请求')
    if (staleOutcome === 'success') await firstRequest.fulfill({ json: [{ menu_id: menuId(0) }] })
    else
      await firstRequest.fulfill({
        status: 503,
        json: { code: 'TEST_UNAVAILABLE', message: '旧请求测试失败' }
      })
    await page.waitForTimeout(500)
    await expect(selected).toHaveText('已选 2 / 1601 项')
    await expect(save).toBeEnabled()
    expect(savedPayloads).toEqual([])
    expect(pageErrors).toEqual([])
  })
}

test('pending save freezes the draft and closes only after a successful response', async ({
  page
}) => {
  const { dialog, openButtons, save, selected, search, savedPayloads, pageErrors } =
    await prepare(page)
  let pendingSave: Route | undefined
  await page.route('**/rest/v1/rpc/set_role_menus', (route) => {
    savedPayloads.push(route.request().postDataJSON())
    pendingSave = route
  })
  await openButtons.first().click()
  await expect(save).toBeEnabled({ timeout: 60_000 })
  await save.click()
  await expect.poll(() => Boolean(pendingSave)).toBe(true)
  await expect(save).toBeDisabled()
  await expect(search).toBeDisabled()
  await expect(dialog.getByRole('button', { name: '全部选择', exact: true })).toBeDisabled()
  await expect(dialog.locator('.role-permission-dialog__tree-viewport')).toHaveAttribute(
    'inert',
    ''
  )
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await expect(selected).toHaveText('已选 1 / 1601 项')
  expect(savedPayloads).toHaveLength(1)
  expect(savedPayloads[0].p_menu_ids).toEqual([menuId(0)])
  if (!pendingSave) throw new Error('缺少待完成的保存请求')
  await pendingSave.fulfill({ json: null })
  await expect(dialog).toBeHidden()
  expect(savedPayloads).toHaveLength(1)
  expect(pageErrors).toEqual([])
})
