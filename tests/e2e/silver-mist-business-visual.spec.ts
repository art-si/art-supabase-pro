import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { TableColumnCatalog } from '../../src/types/table-column-config'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { installQueryDateClock } from './support/query-date-range'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 20_000 })
// Allow Vite's first workspace load in a cold browser run.
test.setTimeout(300_000)

const userPath = '/system/user'
const supplierPath = '/mdm/purchase-master/supplier'
const routePath = '/tms/basic-data/favorite-route'
const carrierPricePath = '/tms/basic-data/carrier-price'
const taskPath = '/mes/production-plan/operation-task'
const purchasePath = '/scm/purchase-management/purchase-request'

function createMenu(path: string, name: string, title: string, extraActions: string[] = []) {
  const menu = {
    id: name,
    parentId: null,
    name,
    path,
    component: path,
    type: 'menu',
    sort: 1,
    meta: { title, is_enable: true, is_hide: false, roles: [] }
  }
  return [
    menu,
    ...['View', 'Add', 'Edit', ...extraActions].map((action) => ({
      ...menu,
      id: `${name}:${action}`,
      parentId: menu.id,
      name: `${name}:${action}`,
      path: '',
      component: '',
      type: 'button'
    }))
  ]
}

const boxBorderMode = (project: string) => !project.includes('shadow')

async function applySilverMist(page: Page, borderMode: boolean) {
  const open = page.getByRole('button', { name: '打开界面设置', exact: true })
  const preset = page.getByRole('button', { name: /^银雾工作台/ })
  // The settings drawer is mounted lazily; the shell button can be visible first.
  await expect(async () => {
    if (!(await preset.isVisible())) await open.click()
    await expect(preset).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 45_000 })
  await preset.click()
  await expect(page.locator('html')).toHaveAttribute('data-workspace-appearance', 'silver-mist')
  if (!borderMode) {
    await page.getByRole('button', { name: /^精细配置/ }).click()
    await page.getByRole('button', { name: '阴影', exact: true }).click()
  }
  await page.getByRole('button', { name: '关闭界面设置', exact: true }).click()
  await expect(page.locator('.smart-layout-presets')).toBeHidden()
}

const formItem = (dialog: Locator, key: string) =>
  dialog.locator(`[data-art-form-item-key="${key}"]`)

test.beforeEach(async ({ page }, info) => {
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await prepareAppearance(page, { theme, boxBorderMode: boxBorderMode(info.project.name) })
  const tenant = await prepareIsolatedSession(page, {
    tenantId: '11111111-1111-4111-8111-111111111111'
  })
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [
        { code: 'platform', name: '测试平台', baseUrl: '/' },
        { code: 'mdm', name: '主数据管理', baseUrl: '/mdm/' },
        { code: 'tms', name: '运输管理', baseUrl: '/tms/' },
        { code: 'mes', name: '生产管理', baseUrl: '/mes/' },
        { code: 'scm', name: '供应链管理', baseUrl: '/scm/' }
      ]
    })
  )
  await mockApplicationMenus(page, {
    platform: createMenu(userPath, 'User', '用户管理', ['ResetPassword', 'Delete', 'AssignRole']),
    mdm: createMenu(supplierPath, 'MdmPurchaseSupplier', '供应商'),
    tms: [
      ...createMenu(routePath, 'TmsFavoriteRoute', '常用线路'),
      ...createMenu(carrierPricePath, 'TmsCarrierPrice', '承运商协议价')
    ],
    mes: createMenu(taskPath, 'MesOperationTask', '作业任务'),
    scm: createMenu(purchasePath, 'ScmPurchaseRequest', '采购申请')
  })
  const organizations = [
    {
      id: 'visual-org-root',
      parent_id: null,
      organization_name: '华中运营中心',
      organization_code: 'ROOT'
    },
    {
      id: 'visual-org-child',
      parent_id: 'visual-org-root',
      organization_name: '仓储运营部',
      organization_code: 'WH'
    },
    {
      id: 'visual-org-support',
      parent_id: 'visual-org-root',
      organization_name: '客户支持部',
      organization_code: 'CS'
    }
  ].map((record, sort) => ({
    ...record,
    sort,
    tenant_id: tenant.id,
    status: '1',
    organization_type: 'department'
  }))
  await page.route('**/rest/v1/rpc/get_organization_list_secure', (route) =>
    route.fulfill({ json: organizations })
  )
  await page.route('**/rest/v1/mdm_organization?*', (route) =>
    route.fulfill({ json: organizations })
  )
  await page.route('**/rest/v1/sys_user?*', (route) => {
    const select = new URL(route.request().url()).searchParams.get('select')
    if (!select?.includes('organization:mdm_organization!')) return route.fallback()
    return route.fulfill({
      headers: {
        'content-range': '0-0/1',
        'access-control-expose-headers': 'content-range'
      },
      json: [
        {
          id: 'visual-user',
          tenant_id: tenant.id,
          user_name: '张明',
          user_nick_name: '运营专员',
          user_email: 'operator@example.invalid',
          user_type: 'normal',
          account_identity_type: 'external',
          organization_id: 'visual-org-child',
          status: '1'
        }
      ]
    })
  })
  await page.route('**/rest/v1/sys_dictionary?*', (route) => {
    const typeCode = new URL(route.request().url()).searchParams.get('dict_type_table.code')
    const supplierOptions = [
      { label: '生产供应商', value: 'production' },
      { label: '服务供应商', value: 'service' }
    ]
    const dictionary = {
      supplierCategory: supplierOptions,
      supplierType: supplierOptions,
      sysUserIdentityType: [
        { label: '员工', value: 'employee' },
        { label: '外部协作', value: 'external' },
        { label: '服务账号', value: 'service' }
      ]
    }
    const entries = Object.entries(dictionary)
      .filter(([code]) => !typeCode || typeCode === `eq.${code}`)
      .flatMap(([code, options]) =>
        options.map((option, sort) => ({
          ...option,
          id: `${code}-${sort}`,
          status: '1',
          sort,
          dict_type_table: { code }
        }))
      )
    return route.fulfill({
      json: entries
    })
  })
  await page.route('**/rest/v1/rpc/tms_list_favorite_routes_secure', (route) =>
    route.fulfill({
      json: {
        records: [
          { id: 'visual-route-a', tenant_id: tenant.id, route_name: '武汉至长沙', enabled: true },
          { id: 'visual-route-b', tenant_id: tenant.id, route_name: '武汉至南昌', enabled: false }
        ],
        total: 2
      }
    })
  )
  await page.route('**/rest/v1/mdm_supplier?*', (route) => {
    const query = new URL(route.request().url()).searchParams.get('or')
    const records = [
      {
        id: 'visual-supplier-a',
        tenant_id: tenant.id,
        supplier_code: 'SUP-001',
        supplier_name: '华中精密设备',
        supplier_type: 'production',
        supplier_category: 'production',
        contact_person: '陈工',
        update_time: '2026-11-05T08:00:00Z'
      },
      {
        id: 'visual-supplier-b',
        tenant_id: tenant.id,
        supplier_code: 'SUP-002',
        supplier_name: '远航工业服务',
        supplier_type: 'service',
        supplier_category: 'service'
      }
    ]
    const rows = query?.includes('SUP-001') ? records.slice(0, 1) : records
    return route.fulfill({
      headers: {
        'content-range': `0-${rows.length - 1}/${rows.length}`,
        'access-control-expose-headers': 'content-range'
      },
      json: rows
    })
  })
})

test('用户管理查询表格与新增编辑弹窗', async ({ page }, info) => {
  await page.goto(`#${userPath}`, { waitUntil: 'domcontentloaded' })
  const table = page.locator('.art-table-query .el-table').first()
  const row = table.getByRole('row').filter({ hasText: '张明' })
  await expect(row).toBeVisible({ timeout: 90_000 })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await expect(page.locator('html')).not.toHaveAttribute('data-workspace-appearance', 'silver-mist')
  const screen = (name: string) =>
    page.screenshot({ path: info.outputPath(`${name}.png`), animations: 'disabled' })
  await screen('user-standard')
  await applySilverMist(page, boxBorderMode(info.project.name))
  await assertAppearance(page, { theme, boxBorderMode: boxBorderMode(info.project.name) })
  await expect(row).toBeVisible()
  const query = page.locator('.art-search-bar').getByRole('button', { name: '查询', exact: true })
  const queryFill = await query.evaluate((element) => getComputedStyle(element).backgroundColor)
  const showToolbar = page.getByRole('switch', { name: '显示表格右侧工具栏' })
  if (!(await showToolbar.isChecked())) await showToolbar.press('Space')
  const searchToggle = page.getByRole('button', { name: '收起搜索条件', exact: true })
  await expect(searchToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(searchToggle).not.toHaveCSS('background-color', queryFill)
  await screen('user-query')
  const toolbar = page.getByRole('button', { name: '打开界面设置', exact: true })
  await toolbar.click()
  const studio = page.getByRole('dialog').filter({ has: page.locator('.setting-header') })
  await studio.getByRole('button', { name: /^精细配置/ }).click()
  const copy = studio.getByRole('button', { name: '复制配置', exact: true })
  await copy.scrollIntoViewIfNeeded()
  await expect(copy).toHaveCSS('background-color', queryFill)
  const onSwitch = studio.locator('.el-switch.is-checked .el-switch__core').last()
  await expect(onSwitch).toHaveCSS(
    'background-color',
    await copy.evaluate((element) => getComputedStyle(element).backgroundColor)
  )
  await screen('user-settings')
  await studio.getByRole('button', { name: '关闭界面设置', exact: true }).click()
  await expect(studio).toBeHidden()
  const add = page.getByRole('button', { name: '新增用户', exact: true })
  await add.click()
  const create = page.getByRole('dialog', { name: '新增用户', exact: true })
  await expect(formItem(create, 'userName').getByRole('textbox')).toBeVisible()
  await screen('user-create')
  await create.getByRole('button', { name: '取消', exact: true }).click()
  await expect(create).toBeHidden()
  await row.getByRole('button', { name: '编辑', exact: true }).click()
  const edit = page.getByRole('dialog', { name: '编辑用户', exact: true })
  await expect(formItem(edit, 'userName').getByRole('textbox')).toHaveValue('张明')
  await expect(edit.locator('.el-dialog__footer')).toHaveCSS(
    'background-color',
    await edit.locator('.el-dialog__header').evaluate((el) => getComputedStyle(el).backgroundColor)
  )
  await screen('user-edit')
  const organization = formItem(edit, 'organizationId')
  await organization.locator('.el-select__wrapper').click()
  const tree = page.locator('.el-tree-select__popper:visible')
  await expect(tree.getByText(/仓储运营部/)).toBeVisible()
  const selected = tree.locator(
    '.el-tree-node__content:has(> .el-select-dropdown__item.is-selected)'
  )
  await expect(selected).toHaveCount(1)
  await expect(selected).toHaveCSS('background-color', /color\(srgb /)
  await tree.getByText(/仓储运营部/).hover()
  await page.mouse.move(10, 10)
  await screen('user-organization-tree')
  await tree.getByText(/客户支持部/).click()
  await expect(organization).toContainText('客户支持部')
  await expect(tree).toBeHidden()
})

test('银雾窄屏编辑弹窗的组织下拉完整可用，Escape 优先关闭下拉', async ({ page }, info) => {
  await page.goto(`#${userPath}`, { waitUntil: 'domcontentloaded' })
  const table = page.locator('.art-table-query .el-table').first()
  const row = table.getByRole('row').filter({ hasText: '张明' })
  await expect(row).toBeVisible({ timeout: 90_000 })
  await applySilverMist(page, boxBorderMode(info.project.name))
  await row.getByRole('button', { name: '编辑', exact: true }).click()
  const edit = page.getByRole('dialog', { name: '编辑用户', exact: true })
  await expect(edit).toBeVisible()
  await page.setViewportSize({ width: 390, height: 580 })

  const organization = formItem(edit, 'organizationId')
  const field = organization.getByRole('combobox')
  await organization.locator('.el-select__wrapper').click()
  const tree = page.locator('.el-popper.el-tree-select__popper:visible')
  await expect(tree.getByText(/仓储运营部/)).toBeVisible()
  await page.screenshot({ path: info.outputPath('user-edit-tree-390.png'), animations: 'disabled' })
  await expect
    .poll(async () => {
      const box = await tree.boundingBox()
      if (!box) return Infinity
      return Math.max(-box.x, -box.y, box.x + box.width - 390, box.y + box.height - 580, 0)
    })
    .toBeLessThanOrEqual(1)
  await page.keyboard.press('Escape')
  await expect(tree).toBeHidden()
  await expect(edit).toBeVisible()
  await expect(field).toBeFocused()

  await organization.locator('.el-select__wrapper').click()
  await tree.getByText(/客户支持部/).click()
  await expect(organization).toContainText('客户支持部')
  await expect(tree).toBeHidden()
  await expect(edit.getByRole('button', { name: '取消', exact: true })).toBeEnabled()
})

test('作业任务日期选择器区分范围与端点', async ({ page }, info) => {
  await installQueryDateClock(page)
  await page.goto(`#${taskPath}`, { waitUntil: 'domcontentloaded' })
  const field = formItem(page.locator('.art-search-bar:visible'), 'workOrderStartDates')
  await expect(field).toBeVisible({ timeout: 90_000 })
  await applySilverMist(page, boxBorderMode(info.project.name))
  const start = field.getByPlaceholder('开始日期')
  await start.press('ArrowDown')
  const popup = page.locator('.el-picker__popper:has(.el-date-range-picker):visible')
  await expect(popup.getByRole('button', { name: '今天', exact: true })).toBeVisible()
  const dates = popup.locator('.el-date-range-picker__content').first().locator('td.available')
  await dates.filter({ hasText: /^7$/ }).click()
  await dates.filter({ hasText: /^10$/ }).hover()
  await expect(popup.locator('td.in-range:not(.start-date, .end-date)').first()).toBeVisible()
  await page.screenshot({ path: info.outputPath('task-date-range.png'), animations: 'disabled' })
  await dates.filter({ hasText: /^10$/ }).click()
  await expect(start).toHaveValue('2026-11-07')
  await expect(field.getByPlaceholder('结束日期')).toHaveValue('2026-11-10')
  await expect(popup).toBeHidden()
  await expect(start).toBeFocused()
  await page.setViewportSize({ width: 757, height: 844 })
  await start.press('ArrowDown')
  await expect(popup.getByRole('button', { name: '今天', exact: true })).toBeVisible()
  const box = (await popup.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(757)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(844)
  await page.screenshot({
    path: info.outputPath('task-date-range-757.png'),
    animations: 'disabled'
  })

  await dates.filter({ hasText: /^7$/ }).click()
  const secondMonthEnd = popup
    .locator('.el-date-range-picker__content')
    .nth(1)
    .locator('td.available')
    .filter({ hasText: /^27$/ })
  await secondMonthEnd.scrollIntoViewIfNeeded()
  await expect(secondMonthEnd).toBeInViewport()
  await page.screenshot({
    path: info.outputPath('task-date-range-757-second-month.png'),
    animations: 'disabled'
  })
  await secondMonthEnd.click()
  await expect(start).toHaveValue('2026-11-07')
  await expect(field.getByPlaceholder('结束日期')).toHaveValue('2026-12-27')
  await expect(popup).toBeHidden()
})

test('银雾深查：协议价级联筛选保留展开路径和选中项', async ({ page }, info) => {
  await page.route('**/rest/v1/rpc/tms_list_carrier_prices_secure', (route) =>
    route.fulfill({ json: { records: [], total: 0, fieldAccess: {} } })
  )
  await page.goto(`#${carrierPricePath}`, { waitUntil: 'domcontentloaded' })
  const origin = formItem(page.locator('.art-search-bar:visible'), 'originRegionPath')
  const input = origin.locator('input')
  await expect(input).toBeVisible({ timeout: 90_000 })
  const popup = page.locator('.el-cascader__dropdown:visible')
  const menus = popup.locator('.el-cascader-menu')
  const regions = ['新疆维吾尔自治区', '伊犁哈萨克自治州', '察布查尔锡伯自治县']
  const district = menus.nth(2).getByRole('menuitem').filter({ hasText: regions[2] })
  async function selectDistrict() {
    await input.click()
    await menus.nth(0).getByText(regions[0], { exact: true }).click()
    await menus.nth(1).getByText(regions[1], { exact: true }).click()
    await district.locator('.el-radio').click()
    await expect(input).toHaveValue(regions.join(' / '))
    await expect(district.locator('.el-radio__input')).toHaveClass(/is-checked/)
    await page.mouse.move(10, 10)
  }

  await selectDistrict()
  await page.screenshot({
    path: info.outputPath('carrier-region-standard.png'),
    animations: 'disabled'
  })
  await applySilverMist(page, boxBorderMode(info.project.name))
  await expect(popup).toBeHidden()
  await selectDistrict()
  await page.screenshot({
    path: info.outputPath('carrier-region-selected.png'),
    animations: 'disabled'
  })
  await page.setViewportSize({ width: 390, height: 820 })
  await district.scrollIntoViewIfNeeded()
  await expect(district.locator('.el-radio__inner')).toBeInViewport()
  const { x, width } = (await popup.boundingBox())!
  expect(x).toBeGreaterThanOrEqual(0)
  expect(x + width).toBeLessThanOrEqual(391)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({
    path: info.outputPath('carrier-region-narrow.png'),
    animations: 'disabled'
  })
})

test('银雾深查：用户表头筛选能选中并应用', async ({ page }, info) => {
  const catalogs = JSON.parse(
    readFileSync('src/config/table-column-catalog.generated.json', 'utf8')
  ) as TableColumnCatalog[]
  const catalog = catalogs.find(({ routePath }) => routePath === userPath)
  if (!catalog) throw new Error('缺少用户管理列目录')
  const columns = catalog.columns.map((column) =>
    column.key === 'accountIdentityType' ? { ...column, filterType: 'select' } : column
  )
  await page.route('**/rest/v1/rpc/get_table_column_runtime', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        catalog,
        profiles: [
          {
            id: 'filter-profile',
            menuId: catalog.menuId,
            scope: 'platform',
            tenantId: null,
            subjectId: null,
            source: 'configured',
            columns,
            priority: 0,
            revision: 1,
            updatedAt: '2026-11-17T00:00:00Z'
          }
        ]
      }
    })
  )
  await page.goto(`#${userPath}`, { waitUntil: 'domcontentloaded' })
  const row = page.getByRole('row').filter({ hasText: '张明' })
  await expect(row).toBeVisible({ timeout: 90_000 })
  await applySilverMist(page, boxBorderMode(info.project.name))
  const trigger = page.getByRole('button', { name: '账号身份过滤', exact: true })
  await trigger.click()
  const filter = page.getByRole('dialog', { name: '账号身份过滤', exact: true })
  const option = filter.getByRole('checkbox', { name: '外部协作', exact: true })
  await option.press('Space')
  await expect(option).toBeChecked()
  await page.screenshot({ path: info.outputPath('user-column-filter.png'), animations: 'disabled' })
  await filter.getByRole('button', { name: '应用过滤', exact: true }).click()
  await expect(trigger).toHaveAttribute('aria-pressed', 'true')
  await expect(row).toBeVisible()
  await page.screenshot({
    path: info.outputPath('user-column-filter-active.png'),
    animations: 'disabled'
  })
})

test('银雾深查：用户更多操作、注销确认和角色多选', async ({ page }, info) => {
  const roles = ['仓储主管', '运营专员', '采购助理', '对账专员', '数据只读']
  await page.route('**/rest/v1/sys_role?*', (route) =>
    route.fulfill({
      json: roles.map((roleName, index) => ({
        id: `role-${index}`,
        role_name: roleName,
        role_code: `QA_ROLE_${index}`,
        enabled: true,
        tenant_id: '11111111-1111-4111-8111-111111111111'
      }))
    })
  )
  await page.goto(`#${userPath}`, { waitUntil: 'domcontentloaded' })
  const row = page.getByRole('row').filter({ hasText: '张明' })
  await expect(row).toBeVisible({ timeout: 90_000 })
  await applySilverMist(page, boxBorderMode(info.project.name))
  const more = row.getByRole('button', { name: '更多操作', exact: true })
  await more.press('Enter')
  const danger = page.getByRole('menuitem', { name: '注销用户', exact: true })
  await expect(danger).toBeVisible()
  await page.screenshot({ path: info.outputPath('user-more-actions.png'), animations: 'disabled' })
  await danger.click()
  const confirm = page.getByRole('dialog', { name: '注销用户', exact: true })
  await expect(confirm.getByText(/无法继续登录/)).toBeVisible()
  await expect(danger).toBeHidden()
  await page.screenshot({
    path: info.outputPath('user-confirm-deactivation.png'),
    animations: 'disabled'
  })
  await confirm.getByRole('button', { name: '取消', exact: true }).click()
  await expect(confirm).toBeHidden()
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '分配角色', exact: true }).click()
  const roleDialog = page.getByRole('dialog', { name: '分配用户角色', exact: true })
  const field = formItem(roleDialog, 'userRoles')
  const combo = field.getByRole('combobox')
  await combo.press('ArrowDown')
  const selectedRoles = page
    .locator('.el-select__popper:visible')
    .getByRole('option', { selected: true })
  for (const role of roles.slice(0, 4)) {
    await page.getByRole('option', { name: role, exact: true }).click()
  }
  await expect(selectedRoles).toHaveCount(4)
  await expect(roleDialog.getByText('已选 4 项', { exact: true })).toBeVisible()
  await page.mouse.move(10, 10)
  await page.screenshot({
    path: info.outputPath('user-role-multi-select.png'),
    animations: 'disabled'
  })
  await combo.press('Escape')
  await roleDialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(roleDialog).toBeHidden()
})

test('采购申请详情抽屉保留正文、分组和状态', async ({ page }, info) => {
  const document = {
    id: 'silver-purchase',
    tenant_id: '11111111-1111-4111-8111-111111111111',
    kind: 'purchase_request',
    document_no: 'PR-2026-018',
    document_date: '2026-11-16',
    status: 'draft',
    details: {},
    subtotal: 360,
    tax_amount: 0,
    total_amount: 360,
    lines: [
      {
        line_id: 'purchase-line',
        line_no: 1,
        material_description: '设备安装支架',
        material_code: 'M-BRACKET',
        quantity: 12,
        unit: '件',
        unit_price: 30,
        discount_rate: 0,
        tax_rate: 0,
        reason: '华中仓库设备维护'
      }
    ],
    payment_plans: [],
    delivery_plans: [],
    clauses: []
  }
  await page.route('**/rest/v1/scm_purchase_document?*', (route) => {
    const params = new URL(route.request().url()).searchParams
    return route.fulfill({
      json: params.has('id')
        ? document
        : params.get('kind') === 'eq.purchase_order'
          ? []
          : [document],
      headers: { 'content-range': '0-0/1' }
    })
  })
  await page.goto(`#${purchasePath}`, { waitUntil: 'domcontentloaded' })
  const number = page.getByRole('button', { name: 'PR-2026-018', exact: true }).first()
  await expect(number).toBeVisible({ timeout: 90_000 })
  await applySilverMist(page, boxBorderMode(info.project.name))
  await number.click()
  const drawer = page.getByRole('dialog', { name: '查看采购申请', exact: true })
  await expect(drawer.getByRole('cell', { name: '待核对', exact: true })).toBeVisible()
  await expect(drawer.getByText('单据基本信息', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('purchase-detail.png'), animations: 'disabled' })
  await drawer.getByRole('tab', { name: '申请明细', exact: true }).click()
  await expect(drawer.getByText('设备安装支架', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('purchase-lines.png'), animations: 'disabled' })
  await drawer.getByRole('button', { name: '关闭抽屉', exact: true }).click()
  await expect(drawer).toBeHidden()
})

test('供应商查询、编辑和实际字典下拉', async ({ page }, info) => {
  await page.goto(`#${supplierPath}`, { waitUntil: 'domcontentloaded' })
  const row = page.getByRole('row').filter({ hasText: 'SUP-001' })
  await expect(row).toBeVisible({ timeout: 90_000 })
  await applySilverMist(page, boxBorderMode(info.project.name))
  await expect(row).toBeVisible()
  await page.getByPlaceholder('编码、名称、联系人或地址').fill('SUP-001')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('远航工业服务', { exact: true })).toBeHidden()
  const screen = (name: string) =>
    page.screenshot({ path: info.outputPath(`${name}.png`), animations: 'disabled' })
  await screen('supplier-query')
  await page.getByRole('button', { name: '新增供应商', exact: true }).click()
  const create = page.getByRole('dialog', { name: '新增供应商', exact: true })
  await expect(create).toBeVisible()
  await screen('supplier-create')
  await create.getByRole('button', { name: '取消', exact: true }).click()
  await expect(create).toBeHidden()
  await row.getByRole('button', { name: '编辑', exact: true }).click()
  const edit = page.getByRole('dialog', { name: '编辑供应商', exact: true })
  const combo = formItem(edit, 'supplierType').getByRole('combobox')
  await expect(combo).toBeVisible()
  await screen('supplier-edit')
  await combo.press('ArrowDown')
  const popup = page.locator('.el-select__popper:visible')
  const selected = popup.getByRole('option', { name: '生产供应商', exact: true, selected: true })
  await expect(selected).toBeVisible()
  expect(await selected.evaluate((el) => getComputedStyle(el, '::after').borderRightWidth)).toBe(
    '2px'
  )
  await screen('supplier-dropdown')
  await popup.getByRole('option', { name: '服务供应商', exact: true }).click()
  await expect(formItem(edit, 'supplierType')).toContainText('服务供应商')
  await expect(popup).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
})

test('常用线路选中行、专注与新增表单', async ({ page }, info) => {
  await page.goto(`#${routePath}`, { waitUntil: 'domcontentloaded' })
  const workspace = page.locator('.art-table-query')
  const row = workspace.getByRole('row').filter({ hasText: '武汉至长沙' })
  await expect(row).toBeVisible({ timeout: 90_000 })
  await applySilverMist(page, boxBorderMode(info.project.name))
  const focus = page.getByRole('switch', { name: '进入专注模式', exact: true })
  await focus.press('Space')
  await expect(workspace).toHaveClass(/is-focus-mode/)
  const checkbox = row.getByRole('checkbox').first()
  await checkbox.press('Space')
  await expect(checkbox).toBeChecked()
  await expect(row).toHaveClass(/is-art-selected-row/)
  await page.screenshot({ path: info.outputPath('route-selected.png'), animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(workspace).not.toHaveClass(/is-focus-mode/)
  await page.getByRole('button', { name: '新增线路', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增常用线路', exact: true })
  await expect(formItem(dialog, 'routeName').getByRole('textbox')).toBeVisible()
  await page.screenshot({ path: info.outputPath('route-create.png'), animations: 'disabled' })
})
