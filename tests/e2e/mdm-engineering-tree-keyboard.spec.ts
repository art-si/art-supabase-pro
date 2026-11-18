import { expect, test } from '@playwright/test'
import { tenantId } from './support/inventory-fixtures'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('MDM工程树键盘：配件项目按键筛选且清掉原勾选', async ({ page }) => {
  await prepareIsolatedSession(page)
  const lists = [
    { project: '安装一期', drawing: '安装一期结构图', item: '钢制安装支架' },
    { project: '装配二期', drawing: '装配二期结构图', item: '镀锌装配垫片' }
  ].map(({ project, drawing, item }, index) => ({
    id: `accessory-${index}`,
    tenant_id: tenantId,
    project_id: `project-${index}`,
    project_name: project,
    drawing_name: drawing,
    source_name: '',
    status: 'draft',
    warnings: [],
    create_time: '2026-11-01T08:00:00Z',
    items: [{ id: `item-${index}`, row_no: 1, name: item, quantity: 1, workOrders: [] }]
  }))
  await page.route('**/rest/v1/mdm_accessory_processing_list?*', (route) =>
    route.fulfill({
      status: 206,
      headers: {
        'content-range': `0-${lists.length - 1}/${lists.length}`,
        'access-control-expose-headers': 'content-range'
      },
      json: lists
    })
  )
  const backgroundRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (
      url.pathname.includes('/functions/v1/ai-accessory') ||
      url.pathname.includes('/rpc/mdm_save_accessory')
    )
      backgroundRequests.push(url.pathname)
  })
  await page.goto('/tests/e2e/fixtures/mdm-scroll-ownership.html?entry=accessory', {
    waitUntil: 'domcontentloaded'
  })
  const tree = page.locator('.accessory-processing-page__navigator')
  const branch = tree.locator('[role="treeitem"][data-key^="project:"]').filter({
    has: page.getByText('装配二期', { exact: true })
  })
  const drawing = tree.getByRole('treeitem', { name: /装配二期结构图/ }).last()
  const detail = page.locator('.accessory-processing-page__detail')
  const rows = detail.locator('.el-table__body tbody tr')
  const first = rows.filter({ hasText: '钢制安装支架' })
  await expect(rows).toHaveCount(2, { timeout: 90_000 })
  await first.getByRole('checkbox', { name: '选择当前行', exact: true }).press('Space')
  await expect(detail.getByText('已选择 1 件。', { exact: true })).toBeVisible()
  await expect(branch).toBeVisible()
  await branch.focus()
  if ((await branch.getAttribute('aria-expanded')) === 'true')
    await page.keyboard.press('ArrowLeft')
  await expect(drawing).toBeHidden()
  await page.keyboard.press('ArrowRight')
  await expect(drawing).toBeVisible()
  await expect(rows).toHaveCount(2)
  await expect(detail.getByText('已选择 1 件。', { exact: true })).toBeVisible()

  await page.keyboard.press('Enter')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('镀锌装配垫片')
  await expect(detail.getByText('已选择 1 件。', { exact: true })).toBeHidden()
  await expect(branch).toBeFocused()
  expect(backgroundRequests).toEqual([])
})

for (const canManage of [false, true]) {
  test(`MDM工程树键盘：组件类型行业范围与行内权限 ${canManage ? '管理' : '只读'}`, async ({
    page
  }) => {
    const tenant = await prepareIsolatedSession(page, { platformSuper: false, tenantId })
    const path = '/mdm/engineering/component-type'
    const menu = {
      id: 'component-type-keyboard',
      parentId: null,
      name: 'MdmComponentType',
      path,
      component: path,
      type: 'menu',
      sort: 1,
      meta: { title: '组件类型', is_enable: true, is_hide: false, roles: [] }
    }
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({ json: [{ code: 'mdm', name: 'MDM主数据', baseUrl: '/mdm/' }] })
    )
    await mockApplicationMenus(page, {
      mdm: [
        menu,
        ...['View', ...(canManage ? ['ManageGroup'] : [])].map((action) => ({
          ...menu,
          id: `${menu.id}-${action}`,
          parentId: menu.id,
          name: `MdmComponentType:${action}`,
          path: '',
          component: '',
          type: 'button'
        }))
      ]
    })
    const groups = [
      { id: 'industry-main', parent_id: null, code: 'MAIN', name: '制造行业' },
      { id: 'industry-child', parent_id: 'industry-main', code: 'CHILD', name: '装备制造' },
      { id: 'industry-other', parent_id: null, code: 'OTHER', name: '物流服务' }
    ].map((group, sort) => ({
      ...group,
      sort,
      tenant_id: tenant.id,
      domain: 'component_industry',
      enabled: true
    }))
    const scopes: Array<string | null> = []
    await page.route('**/rest/v1/mdm_master_group?*', (route) => route.fulfill({ json: groups }))
    await page.route('**/rest/v1/mdm_component_type?*', (route) => {
      scopes.push(new URL(route.request().url()).searchParams.get('group_id'))
      return route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
    })
    await page.goto(`#${path}`, { waitUntil: 'domcontentloaded' })
    const tree = page.locator('.component-type-page__tree')
    const branch = tree.locator('[role="treeitem"][data-key="industry-main"]')
    const child = tree.locator('[role="treeitem"][data-key="industry-child"]')
    const other = tree.locator('[role="treeitem"][data-key="industry-other"]')
    await expect(branch).toBeVisible({ timeout: 90_000 })
    await expect(page.locator('.art-global-loading')).toBeHidden({ timeout: 30_000 })
    await expect.poll(() => scopes.length).toBeGreaterThan(0)
    const before = scopes.length
    await branch.press('ArrowLeft')
    await expect(child).toBeHidden()
    await page.keyboard.press('ArrowRight')
    await expect(child).toBeVisible()
    expect(scopes).toHaveLength(before)
    await page.keyboard.press('Enter')
    await expect.poll(() => scopes.slice(before)).toEqual(['in.(industry-main,industry-child)'])
    await expect(branch).toBeFocused()

    if (!canManage) {
      await expect(
        tree.getByRole('button', { name: /新增下级分组|编辑行业分组|删除行业分组/ })
      ).toHaveCount(0)
      await page.keyboard.press('ArrowRight')
      await expect(child).toBeFocused()
      await page.keyboard.press('Space')
      await expect.poll(() => scopes.at(-1)).toBe('in.(industry-child)')
      return
    }

    await other.getByRole('button', { name: '编辑行业分组', exact: true }).press('Enter')
    const edit = page.getByRole('dialog', { name: '编辑行业分组', exact: true })
    await expect(edit.getByRole('textbox', { name: /分组名称/ })).toHaveValue('物流服务')
    await edit.getByRole('button', { name: '取消', exact: true }).click()
    await expect(edit).toBeHidden()
    await other.getByRole('button', { name: '新增下级分组', exact: true }).press('Space')
    const add = page.getByRole('dialog', { name: '新增行业分组', exact: true })
    await expect(add.getByText('物流服务（OTHER）', { exact: true })).toBeVisible()
    await add.getByRole('button', { name: '取消', exact: true }).click()
    await expect(branch).toHaveClass(/is-current/)
    expect(scopes.slice(before)).toEqual(['in.(industry-main,industry-child)'])
  })
}

test('MDM工程树键盘：ESOP 分类保留查询并返回第一页，停用分类仍可选', async ({ page }) => {
  await prepareIsolatedSession(page)
  const categories = [
    {
      id: 'esop-parent',
      parent_id: null,
      category_code: 'ES-P',
      category_name: '生产作业',
      status: 'enabled'
    },
    {
      id: 'esop-child',
      parent_id: 'esop-parent',
      category_code: 'ES-C',
      category_name: '历史作业',
      status: 'disabled'
    }
  ].map((category, sort) => ({ ...category, sort, tenant_id: 'test-tenant' }))
  const requests: Array<{ category: string | null; keyword: string | null; offset: number }> = []
  await page.route('**/rest/v1/mdm_esop_category?*', (route) => route.fulfill({ json: categories }))
  await page.route('**/rest/v1/mdm_esop_document?*', (route) => {
    const params = new URL(route.request().url()).searchParams
    const offset = Number(params.get('offset') ?? 0)
    requests.push({ category: params.get('category_id'), keyword: params.get('or'), offset })
    return route.fulfill({
      json: [
        {
          id: `esop-document-${offset}`,
          tenant_id: 'test-tenant',
          document_code: `ESOP-${offset}`,
          document_name: offset > 0 ? '次页验收文档' : '首页验收文档',
          status: 'draft',
          bindings: []
        }
      ],
      headers: {
        'content-range': `${offset}-${offset}/45`,
        'access-control-expose-headers': 'content-range'
      }
    })
  })
  await page.goto('/tests/e2e/fixtures/engineering-dictionary-options.html?mode=esop-list', {
    waitUntil: 'domcontentloaded'
  })
  const tree = page.locator('.esop-page__category-tree')
  const branch = tree.locator('[role="treeitem"][data-key="esop-parent"]')
  const child = tree.locator('[role="treeitem"][data-key="esop-child"]')
  await expect(child.getByText('停用', { exact: true })).toBeVisible({ timeout: 90_000 })
  const query = page.locator('.esop-page .art-table-query')
  const keyword = query.getByRole('textbox', { name: '关键字', exact: true })
  await keyword.fill('验收文档')
  await query.getByRole('button', { name: '查询', exact: true }).click()
  await expect.poll(() => requests.at(-1)?.keyword).toContain('验收文档')
  const pageTwo = query.getByRole('listitem', { name: 'page 2', exact: true })
  await pageTwo.click()
  await expect(query.getByText('次页验收文档', { exact: true })).toBeVisible()
  await keyword.fill('尚未提交的条件')
  const before = requests.length
  await branch.press('ArrowLeft')
  await expect(child).toBeHidden()
  await page.keyboard.press('ArrowRight')
  await expect(child).toBeVisible()
  expect(requests).toHaveLength(before)

  await page.keyboard.press('Enter')
  await expect
    .poll(() => requests.slice(before).map(({ category }) => category))
    .toEqual(['in.(esop-parent,esop-child)'])
  expect(requests.at(-1)).toMatchObject({ offset: 0, keyword: expect.stringContaining('验收文档') })
  await expect(query.getByText('首页验收文档', { exact: true })).toBeVisible()
  await expect(keyword).toHaveValue('尚未提交的条件')
  await expect(branch).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(child).toBeFocused()
  await page.keyboard.press('Space')
  await expect.poll(() => requests.at(-1)?.category).toBe('in.(esop-child)')
  await expect(child.getByText('停用', { exact: true })).toBeVisible()
})
