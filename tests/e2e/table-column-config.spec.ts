import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type {
  TableColumnCatalog,
  TableColumnProfile,
  TableColumnSetting
} from '../../src/types/table-column-config'

test.use({ storageState: { cookies: [], origins: [] } })
const tenantId = '11111111-1111-4111-8111-111111111111'
const menuId = '22222222-2222-4222-8222-222222222222'
const columns: TableColumnSetting[] = [
  { key: 'name', label: '名称', visible: true },
  { key: 'code', label: '编码', visible: true },
  { key: 'amount', label: '金额', visible: true }
]
const catalog: TableColumnCatalog = {
  menuId,
  routePath: '/system/user',
  sourceFile: 'src/views/system/user/index.vue',
  columns,
  searchKeys: [],
  revision: 'test-v1'
}
const profile = (settings: TableColumnSetting[] = columns): TableColumnProfile => ({
  id: 'profile',
  menuId,
  scope: 'platform',
  tenantId: null,
  subjectId: null,
  source: 'configured',
  columns: settings,
  priority: 0,
  revision: 1,
  updatedAt: new Date().toISOString()
})

async function mockApi(page: Page) {
  const state = {
    catalogs: [structuredClone(catalog)],
    profiles: [] as TableColumnProfile[],
    runtimeCalls: 0,
    fail: false,
    saves: 0,
    syncedCatalogCount: 0,
    syncedFirstRoute: '',
    subjectRoles: [] as string[]
  }
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  )
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const params = route.request().method() === 'POST' ? route.request().postDataJSON() : {}
    let body: unknown = []
    if (name === 'get_table_column_admin') {
      if (state.fail)
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'PGRST000', message: 'connection unavailable' })
        })
      body = {
        catalogs: state.catalogs,
        menus: [
          {
            id: 'system',
            name: 'System',
            path: '/system',
            type: 'folder',
            meta: { title: '系统管理' }
          },
          ...state.catalogs.map((c) => ({
            id: c.menuId,
            parentId: 'system',
            name: c.menuId === menuId ? 'User' : 'Other',
            path: c.routePath,
            component: c.routePath,
            type: 'menu',
            meta: { title: c.menuId === menuId ? '用户管理' : '其他列表' }
          }))
        ]
      }
    } else if (name === 'sys_tenant')
      body = [{ id: tenantId, tenant_name: '演示租户', tenant_code: 'DEMO', status: '1' }]
    else if (name === 'get_table_column_profiles')
      body = state.profiles.filter((p) => p.menuId === params.p_menu_id)
    else if (name === 'sys_dict_type')
      body = [
        {
          id: '55555555-5555-4555-8555-555555555555',
          name: '验收字典',
          code: 'column_acceptance',
          node_type: 'dictionary',
          parent_id: null,
          status: '1',
          sort: 1
        }
      ]
    else if (name === 'get_table_column_subjects')
      body = [
        {
          value: '33333333-3333-4333-8333-333333333333',
          label: '演示对象 · DEMO',
          ...(params.p_scope === 'user' ? { roleIds: state.subjectRoles } : {})
        }
      ]
    else if (name === 'fms_receivable_workspace_secure') body = { records: [], total: 0 }
    else if (name === 'save_table_column_profile') {
      const config = params.p_config
      const existing = state.profiles.find(
        (p) =>
          p.menuId === config.menuId &&
          p.scope === config.scope &&
          p.tenantId === config.tenantId &&
          p.subjectId === config.subjectId
      )
      state.saves++
      state.profiles = state.profiles.filter((p) => p !== existing)
      state.profiles.push({
        ...config,
        id: existing?.id || 'profile-' + state.saves,
        revision: (existing?.revision ?? 0) + 1,
        updatedAt: new Date().toISOString()
      })
      body = null
    } else if (name === 'get_table_column_runtime') {
      state.runtimeCalls++
      const current = state.catalogs.find((c) => c.routePath === params.p_route_path)
      const profiles = state.profiles.filter((p) => p.menuId === current?.menuId)
      const enabled = profiles.at(-1)?.source === 'configured'
      body = { enabled, catalog: enabled ? current : null, profiles: enabled ? profiles : [] }
    } else if (name === 'sync_table_column_catalog') {
      const catalogs = Array.isArray(params.p_catalogs) ? params.p_catalogs : []
      state.syncedCatalogCount = catalogs.length
      state.syncedFirstRoute =
        typeof catalogs[0]?.routePath === 'string' ? catalogs[0].routePath : ''
      body = catalogs.length
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/1' },
      body: JSON.stringify(body)
    })
  })
  return state
}
async function openEditor(page: Page, query = '') {
  if (!query) {
    const project = test.info().project.name
    query = `?theme=${project.includes('dark') ? 'dark' : 'light'}&box=${project.includes('shadow') ? 'shadow' : 'border'}`
  }
  await page.goto('/tests/e2e/fixtures/table-column-config.html' + query)
  await page.getByRole('button', { name: '用户管理', exact: true }).click()
  await expect(
    page.getByRole('switch', { name: '当前表格读取配置', exact: true }).locator('..')
  ).toBeVisible()
}
async function enableTable(page: Page) {
  const control = page.getByRole('switch', { name: '当前表格读取配置', exact: true })
  if (!(await control.isChecked())) await control.locator('..').click()
}

test('同步列目录按需读取 JSON 资产，不把完整目录编译进发布 JavaScript', async ({ page }) => {
  test.setTimeout(180_000)
  const state = await mockApi(page)
  await openEditor(page)
  const catalogResponse = page.waitForResponse((response) => {
    const path = new URL(response.url()).pathname
    return /table-column-catalog\.generated(?:-[^/]+)?\.json$/.test(path)
  })
  await page.getByRole('button', { name: '同步目录', exact: true }).click()
  const response = await catalogResponse
  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('application/json')
  await expect.poll(() => state.syncedCatalogCount).toBeGreaterThan(100)
  expect(state.syncedFirstRoute).toMatch(/^\//)
  await expect(
    page.getByText(`已同步 ${state.syncedCatalogCount} 个主列表，已有方案保留`)
  ).toBeVisible()
})

test('整表统一切换来源，编辑、预览、保存只影响当前菜单', async ({ page }, info) => {
  const state = await mockApi(page)
  const other = {
    ...structuredClone(catalog),
    menuId: '44444444-4444-4444-8444-444444444444',
    routePath: '/system/other'
  }
  state.catalogs.push(other)
  const otherProfile = { ...profile(), id: 'other-profile', menuId: other.menuId }
  state.profiles.push(otherProfile)
  const otherBefore = JSON.stringify(otherProfile)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openEditor(
    page,
    '?theme=' +
      (info.project.name.includes('dark') ? 'dark' : 'light') +
      '&box=' +
      (info.project.name.includes('shadow') ? 'shadow' : 'border')
  )
  await expect(page.getByRole('columnheader', { name: '读取配置', exact: true })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'name列标题', exact: true })).toHaveCount(0)
  await enableTable(page)
  await page.getByRole('textbox', { name: 'name列标题', exact: true }).fill('业务名称')
  await page.getByRole('switch', { name: '金额显示', exact: true }).locator('..').click()
  await page.getByRole('button', { name: '上移编码', exact: true }).click()
  await page.getByRole('button', { name: '保存列方案', exact: true }).click()
  await expect.poll(() => state.saves).toBe(1)
  const saved = state.profiles.find((p) => p.menuId === menuId)!
  expect(saved.source).toBe('configured')
  expect(saved.columns.map((c) => c.key)).toEqual(['code', 'name', 'amount'])
  expect(saved.columns[2].visible).toBe(false)
  expect(saved.columns.every((c) => !('source' in c))).toBe(true)
  expect(JSON.stringify(state.profiles.find((p) => p.menuId === other.menuId))).toBe(otherBefore)
  await expect(page.getByText('已保存 · 版本 1', { exact: true })).toBeVisible()
  await page.getByRole('radio', { name: '表头预览', exact: true }).locator('..').click()
  await expect(page.locator('.column-config-page__table .el-table__header th .cell')).toHaveText([
    '编码',
    '业务名称'
  ])
  await page.getByRole('radio', { name: '列设置', exact: true }).locator('..').click()
  await page.screenshot({ path: info.outputPath('column-config.png'), fullPage: true })
  await page.getByRole('switch', { name: '当前表格读取配置', exact: true }).locator('..').click()
  await page.getByRole('button', { name: '保存列方案', exact: true }).click()
  await expect.poll(() => state.saves).toBe(2)
  expect(state.profiles.find((p) => p.menuId === menuId)?.source).toBe('frontend')
  await expect(page.getByRole('textbox', { name: 'name列标题', exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
  const frontendRows = page.locator('.column-config-page__table .el-table__body-wrapper tbody tr')
  await expect(frontendRows.nth(0)).toContainText('名称')
  await expect(frontendRows.nth(1)).toContainText('编码')
  await expect(frontendRows.nth(2)).toContainText('金额')
})

test('拖拽排序、三项固定下拉与扩展属性可保存，底部控件不遮挡', async ({ page }, info) => {
  const state = await mockApi(page)
  await openEditor(page)
  await enableTable(page)
  const handles = page.locator('.column-config-page__table .art-table__drag-handle')
  const from = await handles.nth(2).boundingBox()
  const to = await handles.nth(0).boundingBox()
  expect(from).toBeTruthy()
  expect(to).toBeTruthy()
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
  await page.mouse.down()
  await page.mouse.move(to!.x + to!.width / 2, to!.y + 2, { steps: 16 })
  await page.mouse.up()
  await expect(handles.first()).toHaveAttribute('data-row-key', 'amount')
  const fixed = page.getByRole('combobox', { name: '金额固定位置', exact: true })
  await fixed.press('ArrowDown')
  await expect(page.getByRole('option', { name: '不固定', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: '左侧', exact: true })).toBeVisible()
  await page.getByRole('option', { name: '右侧', exact: true }).click()
  await expect(fixed.locator('..').locator('..')).toContainText('右侧')
  await page.getByRole('spinbutton', { name: '金额列宽', exact: true }).fill('188')
  await page.getByRole('spinbutton', { name: '金额列宽', exact: true }).press('Tab')
  await page.getByRole('switch', { name: '金额允许排序', exact: true }).locator('..').click()
  await page.getByRole('combobox', { name: '金额过滤方式', exact: true }).press('ArrowDown')
  await page.getByRole('option', { name: '数值范围', exact: true }).click()
  const align = page.getByRole('combobox', { name: '金额对齐方式', exact: true })
  await align.press('ArrowDown')
  await page.getByRole('option', { name: '右对齐', exact: true }).click()
  await page.getByRole('switch', { name: '金额长文本提示', exact: true }).locator('..').click()
  const geometry = await page.locator('.column-config-page__footer').evaluate((footer) => {
    const frame = footer.getBoundingClientRect()
    return Array.from(footer.querySelectorAll('button')).map((button) => {
      const bounds = button.getBoundingClientRect()
      return Math.abs(bounds.y + bounds.height / 2 - frame.y - frame.height / 2)
    })
  })
  expect(geometry.every((offset) => offset < 2)).toBe(true)
  await page.getByRole('button', { name: '保存列方案', exact: true }).click()
  await expect.poll(() => state.saves).toBe(1)
  const saved = state.profiles[0].columns[0]
  expect(saved.key).toBe('amount')
  expect(saved.fixed).toBe('right')
  expect(saved.width).toBe(188)
  expect(saved.sortable).toBe(true)
  expect(saved.filterType).toBe('number-range')
  expect(saved.align).toBe('right')
  expect(saved.showOverflowTooltip).toBe(false)
  await page.screenshot({ path: info.outputPath('advanced-columns.png'), fullPage: true })
  await page.getByRole('spinbutton', { name: '金额列宽', exact: true }).clear()
  await page.getByRole('spinbutton', { name: '金额列宽', exact: true }).press('Tab')
  await page.getByRole('button', { name: '保存列方案', exact: true }).click()
  await expect.poll(() => state.saves).toBe(2)
  expect(state.profiles[0].columns[0].width).toBeUndefined()
  await expect(page.getByRole('spinbutton', { name: '金额列宽', exact: true })).toHaveValue('')
  await page.getByRole('spinbutton', { name: '金额最小列宽', exact: true }).fill('240')
  await page.getByRole('spinbutton', { name: '金额最小列宽', exact: true }).press('Tab')
  await page.getByRole('button', { name: '保存列方案', exact: true }).click()
  await expect.poll(() => state.saves).toBe(3)
  expect(state.profiles[0].columns[0].minWidth).toBe(240)
  expect(state.profiles[0].columns[0].width).toBeUndefined()
})

for (const slots of [false, true])
  test(`当前页文本、复选、数值和时间过滤可组合并清空${slots ? '（模板列）' : ''}`, async ({
    page
  }, info) => {
    const state = await mockApi(page)
    const dateColumn: TableColumnSetting = {
      key: 'createTime',
      label: '创建时间',
      visible: true,
      filterType: 'date-range'
    }
    state.catalogs[0].columns.push(dateColumn)
    state.profiles = [
      profile([
        { ...columns[0], filterType: 'text' },
        { ...columns[1], filterType: 'select' },
        { ...columns[2], filterType: 'number-range' },
        dateColumn
      ])
    ]
    await page.goto(
      `/tests/e2e/fixtures/table-column-config.html?runtime=1&filters=1${slots ? '&slots=1' : ''}&theme=${info.project.name.includes('dark') ? 'dark' : 'light'}&box=${info.project.name.includes('shadow') ? 'shadow' : 'border'}`
    )
    const rows = page.locator('.el-table__body-wrapper tbody tr')
    await expect(rows).toHaveCount(3)
    const heading = page.getByRole('columnheader').first()
    const headingLabel = await heading.locator('.cell > span').first().boundingBox()
    const headingControl = await heading
      .getByRole('button', { name: '名称过滤', exact: true })
      .boundingBox()
    expect(
      Math.abs(
        headingLabel!.y + headingLabel!.height / 2 - headingControl!.y - headingControl!.height / 2
      )
    ).toBeLessThan(2)
    await page.getByRole('button', { name: '名称过滤', exact: true }).click()
    await page.getByRole('textbox', { name: '名称搜索关键字', exact: true }).fill('alp')
    await page.getByRole('button', { name: '应用过滤', exact: true }).click()
    await expect(rows).toHaveCount(2)
    await page.getByRole('button', { name: '金额过滤', exact: true }).click()
    await page.getByRole('spinbutton', { name: '金额最大值', exact: true }).fill('0')
    await page.getByRole('spinbutton', { name: '金额最大值', exact: true }).press('Tab')
    await page.getByRole('button', { name: '应用过滤', exact: true }).click()
    await expect(rows).toHaveCount(1)
    await expect(rows).toContainText('Alpha')
    await page.getByRole('button', { name: '金额过滤', exact: true }).click()
    await page.getByRole('spinbutton', { name: '金额最大值', exact: true }).clear()
    await page.getByRole('spinbutton', { name: '金额最大值', exact: true }).press('Tab')
    await page.getByRole('button', { name: '应用过滤', exact: true }).click()
    await expect(rows).toHaveCount(2)
    await page.getByRole('button', { name: '清空列过滤', exact: true }).click()
    await expect(rows).toHaveCount(3)
    await page.getByRole('button', { name: '编码过滤', exact: true }).click()
    await page.getByRole('textbox', { name: '编码选项搜索', exact: true }).fill('A')
    await expect(page.getByRole('checkbox', { name: 'B', exact: true })).toHaveCount(0)
    await page.getByRole('checkbox', { name: 'A', exact: true }).locator('..').click()
    await page.getByRole('button', { name: '应用过滤', exact: true }).click()
    await expect(rows).toHaveCount(2)
    await page.getByRole('button', { name: '创建时间过滤', exact: true }).click()
    await page.getByPlaceholder('结束时间（可选）', { exact: true }).fill('2026-10-23')
    await page.getByPlaceholder('结束时间（可选）', { exact: true }).press('Enter')
    await page.getByRole('button', { name: '应用过滤', exact: true }).click()
    await expect(rows).toHaveCount(1)
    await page.screenshot({
      path: info.outputPath(slots ? 'slot-filters.png' : 'column-filters.png'),
      fullPage: true
    })
    await page.getByRole('button', { name: '清空列过滤', exact: true }).click()
    await expect(rows).toHaveCount(3)
    await page.getByRole('button', { name: '创建时间过滤', exact: true }).click()
    await page.getByRole('combobox', { name: '创建时间空值条件', exact: true }).press('ArrowDown')
    await page.getByRole('option', { name: '仅空值', exact: true }).click()
    await page.getByRole('button', { name: '应用过滤', exact: true }).click()
    await expect(rows).toHaveCount(1)
    await expect(rows).toContainText('ALPINE')
    state.profiles[0].columns[3].filterType = 'datetime-range'
    state.profiles[0].revision++
    await page.getByRole('button', { name: '重新读取配置', exact: true }).click()
    await expect(rows).toHaveCount(3)
    await page.getByRole('button', { name: '创建时间过滤', exact: true }).click()
    await page.getByPlaceholder('开始时间（可选）', { exact: true }).fill('2026-10-23 12:00:00')
    await page.getByPlaceholder('开始时间（可选）', { exact: true }).press('Enter')
    await page.getByPlaceholder('结束时间（可选）', { exact: true }).fill('2026-10-23 12:00:00')
    await page.getByPlaceholder('结束时间（可选）', { exact: true }).press('Enter')
    await page.screenshot({
      path: info.outputPath(slots ? 'slot-datetime-filter.png' : 'datetime-filter.png'),
      fullPage: true
    })
    await page.getByRole('button', { name: '应用过滤', exact: true }).click()
    await expect(rows).toHaveCount(1)
  })

for (const [real, routePath] of [
  ['user', '/system/user'],
  ['dict', '/data-center/dict'],
  ['receivable', '/fms/accounts-receivable/estimated-receivable']
])
  test(`真实业务页面接入配置与前端回退：${real}`, async ({ page }, info) => {
    const state = await mockApi(page)
    const catalogs = JSON.parse(
      readFileSync(
        new URL('../../src/config/table-column-catalog.generated.json', import.meta.url),
        'utf8'
      )
    ) as TableColumnCatalog[]
    const realCatalog = structuredClone(catalogs.find((item) => item.routePath === routePath)!)
    state.catalogs = [realCatalog]
    const target = realCatalog.columns.find(
      (column) => !column.locked && !column.key.startsWith('__')
    )!
    const configuredColumns = realCatalog.columns.map((column) =>
      column.key === target.key
        ? { ...column, label: '列配置验收标题', filterType: 'text' as const }
        : column
    )
    state.profiles = [{ ...profile(configuredColumns), menuId: realCatalog.menuId }]
    await page.goto(`/tests/e2e/fixtures/table-column-config.html?real=${real}`)
    if (real === 'dict') await page.getByText('验收字典', { exact: true }).first().click()
    await expect(
      page.getByRole('columnheader', { name: '列配置验收标题', exact: false }).first()
    ).toBeVisible({ timeout: 60000 })
    await expect(
      page.getByRole('button', { name: '列配置验收标题过滤', exact: true }).first()
    ).toBeVisible()
    await page.screenshot({ path: info.outputPath(`real-${real}-configured.png`), fullPage: true })
    state.profiles[0].source = 'frontend'
    await page.reload()
    if (real === 'dict') await page.getByText('验收字典', { exact: true }).first().click()
    await expect(
      page.getByRole('columnheader', { name: '列配置验收标题', exact: false })
    ).toHaveCount(0)
    await expect(
      page.getByRole('columnheader', { name: target.label, exact: false }).first()
    ).toBeVisible({ timeout: 60000 })
  })

test('业务列表统一使用配置列或前端列，权限收紧始终生效', async ({ page }) => {
  const state = await mockApi(page)
  await page.goto('/tests/e2e/fixtures/table-column-config.html?runtime=1')
  const headers = page.locator('.el-table__header th .cell')
  await expect(headers).toHaveText(['名称', '编码', '金额'])
  await expect.poll(() => state.runtimeCalls).toBe(1)
  state.profiles = [
    profile([{ ...columns[1], label: '配置编码' }, { ...columns[0], visible: false }, columns[2]])
  ]
  await page.getByRole('button', { name: '重新读取配置' }).click()
  await expect(headers).toHaveText(['配置编码', '金额'])
  await page.getByRole('button', { name: '撤销金额权限' }).click()
  await expect(headers).toHaveText(['配置编码'])
  state.profiles[0].source = 'frontend'
  state.profiles[0].revision++
  await page.getByRole('button', { name: '重新读取配置' }).click()
  await expect(headers).toHaveText(['名称', '编码'])
})

test('超级管理员为租户、角色和用户分别保存当前表格方案', async ({ page }) => {
  const state = await mockApi(page)
  await openEditor(page)
  for (const scope of ['租户', '角色', '用户']) {
    await page.getByRole('combobox', { name: '配置层级', exact: true }).press('ArrowDown')
    await page.getByRole('option', { name: scope, exact: true }).click()
    if (scope !== '租户') {
      await page
        .getByRole('combobox', { name: scope === '角色' ? '目标角色' : '目标用户', exact: true })
        .press('ArrowDown')
      await page.getByRole('option', { name: /演示对象 · DEMO/ }).click()
    }
    await enableTable(page)
    await page.getByRole('textbox', { name: 'name列标题', exact: true }).fill(`${scope}方案`)
    await page.getByRole('button', { name: '保存列方案', exact: true }).click()
    await expect
      .poll(() =>
        state.profiles.some(
          (p) => p.scope === (scope === '租户' ? 'tenant' : scope === '角色' ? 'role' : 'user')
        )
      )
      .toBe(true)
    await expect(page.getByText('已保存 · 版本 1', { exact: true })).toBeVisible()
  }
  expect(state.profiles.filter((p) => p.tenantId === tenantId)).toHaveLength(3)
})

test('用户首次配置继承所属角色，按多角色优先级生成预览', async ({ page }) => {
  const state = await mockApi(page)
  const low = '55555555-5555-4555-8555-555555555555',
    high = '66666666-6666-4666-8666-666666666666'
  state.subjectRoles = [low, high]
  state.profiles = [
    {
      ...profile(
        columns.map((column) => ({
          ...column,
          label: column.key === 'name' ? '低优先级名称' : column.label
        }))
      ),
      id: 'low',
      scope: 'role',
      tenantId,
      subjectId: low,
      priority: 1
    },
    {
      ...profile(
        columns.map((column) => ({
          ...column,
          label: column.key === 'name' ? '高优先级名称' : column.label
        }))
      ),
      id: 'high',
      scope: 'role',
      tenantId,
      subjectId: high,
      priority: 20
    }
  ]
  await openEditor(page)
  await page.getByRole('combobox', { name: '配置层级', exact: true }).press('ArrowDown')
  await page.getByRole('option', { name: '用户', exact: true }).click()
  await page.getByRole('combobox', { name: '目标用户', exact: true }).press('ArrowDown')
  await page.getByRole('option', { name: /演示对象 · DEMO/ }).click()
  await expect(page.getByRole('textbox', { name: 'name列标题', exact: true })).toHaveValue(
    '高优先级名称'
  )
  await expect(page.getByText('继承上级配置', { exact: true })).toBeVisible()
  await page.getByRole('radio', { name: '表头预览', exact: true }).locator('..').click()
  await expect(page.getByRole('columnheader', { name: '高优先级名称', exact: true })).toBeVisible()
})

test('分组预览保留父子结构，隐藏分组后不能保存空布局', async ({ page }) => {
  const state = await mockApi(page)
  const group: TableColumnSetting = { key: '__group__基础信息', label: '基础信息', visible: true }
  const settings = [group, ...columns.map((column) => ({ ...column, parentKey: group.key }))]
  state.catalogs[0].columns = settings
  state.profiles = [profile(settings)]
  await openEditor(page)
  await page.getByRole('radio', { name: '表头预览', exact: true }).locator('..').click()
  await expect(page.locator('.column-config-page__table .el-table__header thead tr')).toHaveCount(2)
  await expect(page.getByRole('columnheader', { name: '基础信息', exact: true })).toBeVisible()
  await page.getByRole('radio', { name: '列设置', exact: true }).locator('..').click()
  await page.getByRole('switch', { name: '基础信息显示', exact: true }).locator('..').click()
  await page.getByRole('button', { name: '保存列方案', exact: true }).click()
  await expect(
    page.getByText('请至少显示一个业务列；分组列的上级也需保持显示', { exact: true })
  ).toBeVisible()
  expect(state.saves).toBe(0)
  await page.getByRole('radio', { name: '表头预览', exact: true }).locator('..').click()
  await expect(page.getByRole('columnheader', { name: '名称', exact: true })).toHaveCount(0)
})

test('同字段的选择弹窗列工厂不读取菜单主表方案', async ({ page }) => {
  const state = await mockApi(page)
  state.profiles = [
    profile(columns.map((column) => ({ ...column, label: '不应应用的' + column.label })))
  ]
  await page.goto('/tests/e2e/fixtures/table-column-config.html?runtime=1&picker=1')
  await expect(page.locator('.el-table__header th .cell')).toHaveText(['名称', '编码', '金额'])
  await page.getByRole('button', { name: '重新读取配置', exact: true }).click()
  await expect(page.locator('.el-table__header th .cell')).toHaveText(['名称', '编码', '金额'])
  expect(state.runtimeCalls).toBe(0)
})

test('模板列保留原有单元格并统一读取当前表格方案', async ({ page }) => {
  const state = await mockApi(page)
  state.profiles = [
    profile([{ ...columns[1], label: '配置编码' }, { ...columns[0], visible: false }, columns[2]])
  ]
  await page.goto('/tests/e2e/fixtures/table-column-config.html?runtime=1&slots=1')
  await expect(page.locator('.el-table__header th .cell')).toHaveText(['配置编码', '金额'])
  await expect(page.getByText('DEMO-001', { exact: true })).toBeVisible()
})

test('长列列表内部滚动，专注模式保留操作且不撑长整页', async ({ page }, info) => {
  const state = await mockApi(page)
  state.catalogs[0].columns = Array.from({ length: 40 }, (_, index) => ({
    key: 'field' + index,
    label: '业务列 ' + (index + 1),
    visible: true
  }))
  await openEditor(page)
  await enableTable(page)
  const columnSearch = page.getByRole('textbox', { name: '搜索当前表格列', exact: true })
  await expect(page.locator('.column-config-page__modebar').getByRole('textbox')).toHaveCount(1)
  await columnSearch.fill('field39')
  await expect(page.getByRole('textbox', { name: 'field0列标题', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '不可拖拽', exact: true })).toBeDisabled()
  await page.getByRole('switch', { name: '业务列 40显示', exact: true }).locator('..').click()
  await expect(page.getByRole('button', { name: '显示全部业务列', exact: true })).toHaveCount(0)
  await expect(page.getByRole('switch', { name: '业务列 40显示', exact: true })).not.toBeChecked()
  await page.getByRole('switch', { name: '业务列 40显示', exact: true }).locator('..').click()
  await expect(page.getByRole('switch', { name: '业务列 40显示', exact: true })).toBeChecked()
  await columnSearch.clear()
  await expect(page.getByRole('textbox', { name: 'field0列标题', exact: true })).toBeVisible()
  const table = page.locator('.column-config-page__editing .el-table__body-wrapper')
  const before = (await table.boundingBox())!.height
  await expect(page.getByRole('button', { name: '保存列方案', exact: true })).toBeInViewport()
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)
  ).toBe(true)
  await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await expect(page.locator('.business-workspace-header')).toBeHidden()
  await expect(page.getByRole('region', { name: '列配置菜单导航' })).toBeVisible()
  await expect.poll(async () => (await table.boundingBox())!.height).toBeGreaterThan(before + 50)
  const scroll = table.locator('.el-scrollbar__wrap')
  expect(await scroll.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByRole('textbox', { name: 'field39列标题', exact: true })).toBeInViewport()
  await expect(page.getByRole('button', { name: '保存列方案', exact: true })).toBeInViewport()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await page.screenshot({ path: info.outputPath('column-config-focus.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await expect(page.locator('.business-workspace-header')).toBeVisible()
  await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await page.getByRole('switch', { name: '退出专注模式', exact: true }).locator('..').click()
  await expect(page.locator('.business-workspace-header')).toBeVisible()
})

test('失败可重试，窄屏使用菜单抽屉，普通账号无写入入口', async ({ page }, info) => {
  const state = await mockApi(page)
  state.fail = true
  await page.goto('/tests/e2e/fixtures/table-column-config.html')
  await expect(
    page.getByText('数据库服务暂时不可用，请稍后重试', { exact: true }).first()
  ).toBeVisible()
  state.fail = false
  await page.getByRole('button', { name: '重新加载', exact: true }).first().click()
  await page.getByRole('button', { name: '用户管理', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: '保存列方案', exact: true })).toBeInViewport()
  await page.getByRole('button', { name: '选择菜单', exact: true }).click()
  await expect(page.getByRole('region', { name: '列配置菜单导航' })).toBeVisible()
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  )
  await page.screenshot({ path: info.outputPath('column-config-narrow.png'), fullPage: true })
  await page.goto('/tests/e2e/fixtures/table-column-config.html?ordinary=1')
  await expect(
    page.getByText('当前页面仅平台超级管理员可维护，请使用已授权账号', { exact: true }).first()
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '保存列方案', exact: true })).toHaveCount(0)
  await expect(page.getByRole('switch', { name: '当前表格读取配置', exact: true })).toHaveCount(0)
})
