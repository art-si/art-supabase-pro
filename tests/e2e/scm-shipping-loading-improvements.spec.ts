import { expect, test, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { prepareAppearance } from './support/appearance'
import { expectCompactDocumentForm } from './support/scm-document-layout'
import { installDictionaryOptions } from './support/dictionary-options'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(180_000)
test.beforeEach(async ({ page }, info) => {
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
})

test('发货通知明细下推、联系信息和单位带入、装车逐行删除', async ({ page }, testInfo) => {
  const tenant = await prepareIsolatedSession(page, {
    tenantId: '11111111-1111-4111-8111-111111111111'
  })
  await page.route('**/rest/v1/sys_dictionary?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'display-document',
          value: 'document',
          label: '按单据',
          status: '1',
          sort: 1,
          dict_type_table: { code: 'commonDocumentDisplayMode' }
        },
        {
          id: 'display-line',
          value: 'line',
          label: '按明细',
          status: '1',
          sort: 2,
          dict_type_table: { code: 'commonDocumentDisplayMode' }
        }
      ]
    })
  )
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const contractPath = '/scm/sales-management/shipping-notice'
  const orderPath = '/scm/sales-management/loading'
  const menus = [
    { id: 'contract', name: 'ScmShippingNotice', path: contractPath, title: '发货通知单' },
    { id: 'order', name: 'ScmLoading', path: orderPath, title: '发货装车' }
  ].map((item) => ({
    ...item,
    parentId: null,
    component: item.path,
    type: 'menu',
    sort: 1,
    meta: { title: item.title, is_enable: true, is_hide: false, roles: [] }
  }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'scm', name: '测试供应链', baseUrl: '/scm/' }] })
  )
  await mockApplicationMenus(page, {
    scm: [
      ...menus,
      ...menus.flatMap((menu) =>
        [
          'View',
          'Add',
          'Edit',
          'Delete',
          'Copy',
          'Submit',
          'Terminate',
          'Archive',
          'Push',
          'Load'
        ].map((action) => ({
          ...menu,
          id: `${menu.id}-${action}`,
          parentId: menu.id,
          name: `${menu.name}:${action}`,
          path: '',
          component: '',
          type: 'button'
        }))
      ),
      {
        ...menus[1],
        id: 'shipping-add',
        parentId: 'order',
        name: 'ScmShippingNotice:Add',
        path: '',
        component: '',
        type: 'button'
      }
    ]
  })
  const lines = [10, 20].map((quantity, index) => ({
    line_id: `line-${index + 1}`,
    line_no: (index + 1) * 10,
    material_id: `material-${index}`,
    material_code: `QA-M${index}`,
    material_description: `测试物料${index + 1}`,
    base_unit: '件',
    sales_unit: '箱',
    auxiliary_unit: '千克',
    auxiliary_unit2: '米',
    auxiliary_quantity: 20,
    auxiliary_quantity2: 30,
    quantity,
    unit_price: 5,
    tax_rate: 13,
    cost_unit_price: 17,
    delivery_date: '2026-10-16',
    discount_mode: 'none',
    discount_rate: 0,
    material_source: 'purchase',
    gift: false
  }))
  const base = {
    tenant_id: tenant.id,
    project_id: 'project',
    customer_id: 'customer',
    source_id: null,
    document_date: '2026-10-09',
    delivery_date: '2026-10-15',
    currency: 'CNY',
    fees: [],
    payment_plans: [],
    delivery_plans: [],
    clauses: [],
    remark: '',
    subtotal: 150,
    tax_amount: 19.5,
    total_amount: 169.5,
    details: {
      terminal_customer: '终端甲',
      shipping_address: '发货地',
      receiving_address: '收货地',
      receiver_name: '接收甲',
      receiver_phone: '13800000000'
    },
    lines,
    project: { project_name: '测试项目', project_code: 'PJ' }
  }
  const contract = {
    ...base,
    id: 'contract-doc',
    kind: 'shipping_notice',
    document_no: 'QA-NOTICE',
    document_type_id: 'framework',
    status: 'draft'
  }
  const order = {
    ...base,
    id: 'order-doc',
    kind: 'loading',
    document_no: 'QA-LOADING',
    document_type_id: 'order-type',
    status: 'draft'
  }
  const quotation = {
    ...base,
    id: 'quote',
    kind: 'sales_quotation',
    document_no: 'QA-QUOTE',
    status: 'effective'
  }
  await page.route('**/rest/v1/scm_sales_document?**', (route) => {
    const params = new URL(route.request().url()).searchParams
    if (route.request().method() === 'POST') {
      operations.push(route.request().postDataJSON())
      return route.fulfill({ json: { ...order, id: 'saved-loading' } })
    }
    if (params.get('select') === 'id,status,lines') return route.fulfill({ json: [] })
    if (params.get('id')?.startsWith('eq.'))
      return route.fulfill({ json: params.get('id') === 'eq.contract-doc' ? contract : order })
    const rows =
      params.get('kind') === 'eq.shipping_notice'
        ? [contract]
        : params.get('kind') === 'eq.sales_quotation'
          ? [quotation]
          : params.get('kind') === 'eq.loading'
            ? [order]
            : []
    return route.fulfill({
      json: rows,
      headers: {
        'content-range': rows.length ? '0-0/1' : '*/0',
        'access-control-expose-headers': 'content-range'
      }
    })
  })
  await page.route('**/rest/v1/rpc/scm_sales_line_units_secure', (route) =>
    route.fulfill({
      json: lines.map((line) => ({
        document_id: contract.id,
        line_id: line.line_id,
        sales_unit: '箱'
      }))
    })
  )
  await page.route('**/rest/v1/rpc/scm_sales_order_line_progress_secure', (route) =>
    route.fulfill({
      json: lines.map((line, index) => ({
        order_id: order.id,
        line_id: line.line_id,
        shipping_notice_quantity: index ? 0 : 4,
        outbound_quantity: index ? 0 : 2,
        returned_quantity: index ? 0 : 1
      }))
    })
  )
  await page.route('**/rest/v1/rpc/scm_quote_line_allocations_secure', (route) =>
    route.fulfill({ json: [{ quotation_id: 'quote', line_id: 'line-1', quantity: 8 }] })
  )
  let holdMaterials = false
  let failMaterials = false
  const pendingMaterials: Route[] = []
  const materialRows = [
    ...lines,
    { material_id: 'material-2', material_code: 'QA-M2', material_description: '测试物料3' }
  ].map((line) => ({
    id: line.material_id,
    tenant_id: tenant.id,
    material_code: line.material_code,
    material_name: line.material_description,
    description: line.material_description,
    specification_model: '物料规格',
    manufacturer: '物料厂家',
    basic_unit: '件',
    base_unit_id: 'unit',
    sales_unit_id: 'unit',
    material_source: 'purchase',
    category_id: 'category',
    baseUnitRecord: { unit_name: '件' },
    salesUnit: { unit_name: '件' },
    unit_conversions: []
  }))
  await page.route('**/rest/v1/mdm_material?**', (route) => {
    if (holdMaterials) {
      pendingMaterials.push(route)
      return
    }
    if (failMaterials)
      return route.fulfill({
        status: 503,
        json: { code: 'XX000', message: 'synthetic unavailable' }
      })
    return route.fulfill({ json: materialRows })
  })
  await page.route('**/rest/v1/mdm_material_category?**', (route) =>
    route.fulfill({
      json: [
        {
          id: 'category',
          tenant_id: tenant.id,
          category_code: 'A',
          category_name: '原材料',
          parent_id: null
        }
      ]
    })
  )
  let documentTypeConfigured = false
  await page.route('**/rest/v1/sys_menu?**', (route) => {
    const name = new URL(route.request().url()).searchParams.get('name')
    const menu = menus.find((item) => name === `eq.${item.name}`)
    return menu ? route.fulfill({ json: { id: menu.id, name: menu.name } }) : route.fallback()
  })
  await page.route('**/rest/v1/mdm_document_type?**', (route) =>
    route.fulfill({
      json: documentTypeConfigured
        ? [
            {
              id: 'order-type',
              tenant_id: tenant.id,
              document_type_name: '标准发货装车',
              document_type_code: 'FRAME',
              is_default: true
            }
          ]
        : []
    })
  )
  await page.route('**/rest/v1/mdm_project?**', (route) =>
    route.fulfill({
      json: [
        {
          id: 'project',
          tenant_id: tenant.id,
          project_name: '测试项目',
          project_code: 'PJ',
          customer_id: 'customer'
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_customer?**', (route) =>
    route.fulfill({
      json: [
        { id: 'customer', tenant_id: tenant.id, customer_name: '测试客户', customer_code: 'C' }
      ]
    })
  )
  const operations: unknown[] = []
  await page.route('**/rest/v1/rpc/scm_sales_delete_dependencies_secure', (route) =>
    route.fulfill({ json: [] })
  )
  await page.route('**/rest/v1/rpc/scm_sales_delete_secure', (route) => {
    operations.push(route.request().postDataJSON())
    return route.fulfill({ json: 1 })
  })
  await page.route('**/rest/v1/rpc/scm_loading_line_progress_secure', (route) =>
    route.fulfill({
      json: order.lines.map((line) => ({
        loading_id: order.id,
        line_id: line.line_id,
        delivered_quantity: 2
      }))
    })
  )
  await page.route('**/rest/v1/wms_inventory_batch?**', (route) =>
    route.fulfill({
      json: lines.map((line, index) => ({
        id: `batch-${index}`,
        tenant_id: tenant.id,
        material_id: line.material_id,
        warehouse_id: 'warehouse',
        project_id: 'project',
        quantity: 100,
        batch_no: `BATCH-${index}`,
        pack_id: index === 0 ? 'pack-loading-1' : null,
        pack: index === 0 ? { pack_no: 'PK-LOAD-001' } : null,
        warehouse: { warehouse_name: '测试仓库' },
        material: { serial_management_enabled: false }
      }))
    })
  )
  await page.goto(`#${contractPath}`)
  await expect(page.getByRole('button', { name: 'QA-NOTICE', exact: true })).toBeVisible({
    timeout: 120000
  })
  const guide = page.getByText('知道了', { exact: true })
  if (await guide.isVisible()) await guide.click()
  await page.getByRole('radio', { name: '按明细' }).locator('..').click()
  const rows = page.locator('.el-table__body-wrapper tbody tr')
  await rows.nth(1).getByRole('checkbox').locator('..').click()
  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect.poll(() => operations.length).toBe(1)
  expect(operations[0]).toEqual({
    p_selections: [{ document_id: contract.id, line_ids: ['line-2'] }]
  })
  contract.status = 'submitted'
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await rows.nth(0).getByRole('checkbox').locator('..').click()
  holdMaterials = true
  await page.getByRole('button', { name: '下推发货装车', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增发货装车', exact: true })
  const documentNo = dialog.getByRole('textbox', { name: '装车单号', exact: true })
  const type = dialog.locator('[data-art-form-item-key="header.documentTypeId"]')
  const missingTypeHelp = '在 MDM 启用单据类型，并关联「发货装车」。'
  const help = type.getByText(missingTypeHelp, { exact: true })
  await expectCompactDocumentForm(dialog, '装车单号', '承运单位')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'true')
  await expect(dialog.locator('.art-dialog__viewport > .art-overlay-loading')).toBeVisible()
  await expect(dialog.locator('.el-skeleton')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '创建单据', exact: true })).toBeDisabled()
  await expect(help).toHaveCount(0)
  await dialog.screenshot({
    path: testInfo.outputPath('public-dialog-loading.png'),
    animations: 'disabled'
  })
  await expect.poll(() => pendingMaterials.length).toBeGreaterThan(0)
  holdMaterials = false
  failMaterials = true
  await Promise.all(
    pendingMaterials.splice(0).map((route) =>
      route.fulfill({
        status: 503,
        json: { code: 'XX000', message: 'synthetic unavailable' }
      })
    )
  )
  await expect(dialog.getByText('单据选项加载失败', { exact: true })).toBeVisible()
  await expect(help).toHaveCount(0)
  await dialog.getByLabel('终端客户', { exact: true }).fill('终端甲')
  failMaterials = false
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(dialog.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'false')
  await expect(dialog.getByText('单据选项加载失败', { exact: true })).toHaveCount(0)
  await expect(documentNo).toBeDisabled()
  await expect(documentNo).toHaveAttribute('placeholder', '保存后按月度编号规则自动生成')
  await expect(type.getByText('暂无可用类型', { exact: true })).toBeVisible()
  const originalViewport = page.viewportSize()
  await page.setViewportSize({ width: 1024, height: 768 })
  await help.scrollIntoViewIfNeeded()
  await expect(help).toBeInViewport({ ratio: 1 })
  await expect(page.locator('.el-message')).toHaveCount(0)
  await dialog.screenshot({
    path: testInfo.outputPath('loading-missing-type-1024.png'),
    animations: 'disabled'
  })
  if (originalViewport) await page.setViewportSize(originalViewport)

  await expect(dialog.getByRole('button', { name: '手工新增', exact: true })).toHaveCount(0)
  await expect(dialog.getByLabel('终端客户', { exact: true })).toHaveValue('终端甲')
  await expect(dialog.getByLabel('发货地址', { exact: true })).toHaveValue('发货地')
  await expect(dialog.getByLabel('收货地址', { exact: true })).toHaveValue('收货地')
  await expect(dialog.getByLabel('接收人', { exact: true })).toHaveValue('接收甲')
  await expect(dialog.getByLabel('联系电话', { exact: true })).toHaveValue('13800000000')
  await expect(dialog.getByRole('spinbutton', { name: '数量', exact: true })).toHaveCount(1)
  await expect(dialog.getByRole('spinbutton', { name: '数量', exact: true })).toHaveValue('10.000')
  await expect(dialog.locator('tbody')).toContainText('千克')
  await expect(dialog.locator('tbody')).toContainText('米')
  const detailTable = dialog.locator('.art-table.scm-quotation-summary-table')
  await detailTable.locator('.el-table__expand-icon').click()
  const expanded = detailTable.locator('.art-table__expand-content')
  const detailWrap = detailTable.locator('.el-table__body-wrapper .el-scrollbar__wrap')
  const specification = expanded.getByRole('textbox', { name: '规格型号', exact: true })
  await expect(specification).toHaveValue('物料规格')
  await expect(expanded.getByRole('textbox', { name: '生产厂家', exact: true })).toHaveValue(
    '物料厂家'
  )
  await expect(expanded.getByRole('textbox', { name: '仓库', exact: true })).toHaveValue('测试仓库')
  await expect(
    expanded.getByRole('spinbutton', { name: '成本单价（元）', exact: true })
  ).toHaveValue('17.00')
  await expect(expanded.getByRole('combobox', { name: '要货日期', exact: true })).toHaveValue(
    '2026-10-16'
  )
  await specification.click()
  await specification.fill('展开规格验收')
  await expect.poll(() => detailWrap.evaluate((el) => el.scrollLeft)).toBeLessThanOrEqual(2)
  expect((await expanded.boundingBox())!.width).toBeLessThanOrEqual(
    (await detailWrap.boundingBox())!.width + 1
  )
  const expandedBounds = (await expanded.boundingBox())!
  const viewportBounds = (await detailWrap.boundingBox())!
  expect(expandedBounds.y + expandedBounds.height).toBeLessThanOrEqual(
    viewportBounds.y + viewportBounds.height + 1
  )
  await detailTable.screenshot({
    path: testInfo.outputPath('business-expanded-fields.png'),
    animations: 'disabled'
  })

  await page.screenshot({
    path: testInfo.outputPath('notice-push-loading.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await page.goto(`#${orderPath}`)
  await expect(page.getByRole('button', { name: 'QA-LOADING', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '装车数量', exact: true })).toBeVisible()
  await page.getByRole('radio', { name: '按明细' }).locator('..').click()
  await expect(page.getByRole('columnheader', { name: '装车数量', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '已交货数量', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '下推装车出库', exact: true })).toHaveCount(0)
  await rows.nth(0).getByRole('checkbox').locator('..').click()
  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect.poll(() => operations.length).toBe(2)
  expect(operations[1]).toEqual({ p_selections: [{ document_id: order.id, line_ids: ['line-1'] }] })
  documentTypeConfigured = true
  await page.getByRole('button', { name: '编辑', exact: true }).first().click()
  const edit = page.getByRole('dialog', { name: '编辑发货装车 · QA-LOADING', exact: true })
  await expect(
    edit
      .locator('[data-art-form-item-key="header.documentTypeId"]')
      .getByText('标准发货装车', { exact: true })
  ).toBeVisible()
  await expect(edit.getByText(missingTypeHelp, { exact: true })).toHaveCount(0)
  await edit.getByRole('button', { name: '选单', exact: true }).click()
  const picker = page.getByRole('dialog', { name: '选单 · 待发货通知单明细', exact: true })
  await expect(picker.getByRole('columnheader', { name: '通知单数量', exact: true })).toBeVisible()
  await expect(picker.getByRole('columnheader', { name: '可装车数量', exact: true })).toBeVisible()
  await expect(picker.getByRole('columnheader', { name: '可用库存', exact: true })).toBeVisible()
  await expect(picker.getByText('BATCH-0', { exact: true })).toBeVisible()
  await expect(picker.getByRole('columnheader', { name: '包号', exact: true })).toBeAttached()
  const packNumber = picker.getByText('PK-LOAD-001', { exact: true })
  await packNumber.scrollIntoViewIfNeeded()
  await expect(packNumber).toBeInViewport()
  await page.screenshot({
    path: testInfo.outputPath('loading-stock-picker.png'),
    animations: 'disabled'
  })
  await page.setViewportSize({ width: 1024, height: 768 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({
    path: testInfo.outputPath('loading-picker-narrow.png'),
    animations: 'disabled'
  })
  await picker.getByRole('button', { name: '取消', exact: true }).click()
  await edit.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await expect(page.locator('.business-workspace-header')).not.toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.business-workspace-header')).toBeVisible()
  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await page.getByRole('button', { name: /退出专注/ }).click()
  await expect(page.locator('.business-workspace-header')).toBeVisible()

  expect(errors).toEqual([])
})

test('发货通知锁定来源订单后，余量失败可原地重试并带入剩余明细', async ({ page }, info) => {
  const tenant = await prepareIsolatedSession(page, {
    tenantId: '11111111-1111-4111-8111-111111111111',
    platformSuper: false
  })
  await installDictionaryOptions(page, {
    commonDocumentDisplayMode: [
      { value: 'document', label: '按单据' },
      { value: 'line', label: '按明细' }
    ]
  })
  const errors: string[] = []
  const writes: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (
      path.includes('/rest/v1/') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) &&
      (!path.includes('/rpc/') || /\/(save|create|update|delete|submit|batch|post)_/.test(path))
    )
      writes.push(`${request.method()} ${path}`)
  })
  const menu = {
    id: 'retry-notice-menu',
    parentId: null,
    name: 'ScmShippingNotice',
    path: '/scm/sales-management/shipping-notice',
    component: '/scm/sales-management/shipping-notice',
    type: 'menu',
    sort: 1,
    meta: { title: '发货通知单', is_enable: true, is_hide: false, roles: [] }
  }
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'scm', name: '测试供应链', baseUrl: '/scm/' }] })
  )
  await mockApplicationMenus(page, {
    scm: [
      menu,
      ...['View', 'Edit'].map((action) => ({
        ...menu,
        id: `${menu.id}-${action}`,
        parentId: menu.id,
        name: `${menu.name}:${action}`,
        path: '',
        component: '',
        type: 'button'
      }))
    ]
  })
  const sourceLines = [10, 7].map((quantity, index) => ({
    line_id: `source-line-${index + 1}`,
    line_no: (index + 1) * 10,
    material_id: `retry-material-${index + 1}`,
    material_code: `RETRY-M${index + 1}`,
    material_description: index ? '可补入物料' : '原有发货物料',
    base_unit: '件',
    quantity,
    unit_price: 5,
    tax_rate: 0
  }))
  const base = {
    tenant_id: tenant.id,
    project_id: 'retry-project',
    customer_id: 'retry-customer',
    document_type_id: 'notice-type',
    document_date: '2026-10-09',
    delivery_date: '2026-10-15',
    currency: 'CNY',
    fees: [],
    payment_plans: [],
    delivery_plans: [],
    clauses: [],
    details: {},
    remark: '保留当前发货草稿',
    subtotal: 10,
    tax_amount: 0,
    total_amount: 10
  }
  const source = {
    ...base,
    id: 'retry-source-order',
    source_id: null,
    kind: 'sales_order',
    document_no: 'SO-RETRY-001',
    status: 'approved',
    lines: sourceLines
  }
  const notice = {
    ...base,
    id: 'retry-notice',
    source_id: source.id,
    kind: 'shipping_notice',
    document_no: 'NOTICE-RETRY-001',
    status: 'draft',
    lines: [
      {
        ...sourceLines[0],
        line_id: 'existing-notice-line',
        source_line_id: sourceLines[0].line_id,
        source_document_id: source.id,
        source_document_no: source.document_no,
        quantity: 2
      }
    ]
  }
  const remainingRequests: Array<{
    source: string | null
    tenant: string | null
    kind: string | null
  }> = []
  const remainingAttempts: typeof remainingRequests = []
  const heldRemaining: Route[] = []
  let remainingPhase: 'initial' | 'failed' | 'recovered' | 'held' = 'initial'
  const remainingRows = [
    notice,
    {
      id: 'other-notice',
      kind: 'shipping_notice',
      status: 'submitted',
      lines: [{ source_line_id: sourceLines[1].line_id, quantity: 3 }]
    }
  ]
  await page.route('**/rest/v1/scm_sales_document?**', (route) => {
    const query = new URL(route.request().url()).searchParams
    if (query.get('select') === 'id,kind,status,lines') {
      const context = {
        source: query.get('source_id'),
        tenant: query.get('tenant_id'),
        kind: query.get('kind')
      }
      if (remainingPhase !== 'initial') {
        remainingAttempts.push(context)
        // The installed SDK retries 503 GETs; count explicit reads separately from transport retries.
        if (!route.request().headers()['x-retry-count']) remainingRequests.push(context)
      }
      if (remainingPhase === 'failed')
        return route.fulfill({
          status: 503,
          headers: { 'retry-after': '0', 'access-control-expose-headers': 'Retry-After' },
          json: { code: 'XX000', message: 'synthetic remaining source read unavailable' }
        })
      if (remainingPhase === 'held') {
        heldRemaining.push(route)
        return
      }
      return route.fulfill({ json: remainingRows })
    }
    if (query.get('id') === `eq.${notice.id}`) return route.fulfill({ json: notice })
    const rows = query.get('kind') === 'eq.sales_order' ? [source] : [notice]
    return route.fulfill({
      json: rows,
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  })
  await page.route('**/rest/v1/sys_menu?**', (route) => route.fulfill({ json: { id: menu.id } }))
  await page.route('**/rest/v1/mdm_document_type?**', (route) =>
    route.fulfill({
      json: [{ id: 'notice-type', document_type_name: '标准发货通知', is_default: true }]
    })
  )
  await page.route('**/rest/v1/mdm_project?**', (route) =>
    route.fulfill({ json: [{ id: base.project_id, project_code: 'RP', project_name: '重试项目' }] })
  )
  await page.route('**/rest/v1/mdm_customer?**', (route) =>
    route.fulfill({
      json: [{ id: base.customer_id, customer_code: 'RC', customer_name: '重试客户' }]
    })
  )
  await page.route('**/rest/v1/mdm_material?**', (route) =>
    route.fulfill({
      json: sourceLines.map((line) => ({
        id: line.material_id,
        tenant_id: tenant.id,
        material_code: line.material_code,
        material_name: line.material_description,
        description: line.material_description,
        basic_unit: line.base_unit,
        material_source: 'purchase',
        unit_conversions: []
      }))
    })
  )
  await page.goto(`#${menu.path}`)
  await expect(page.getByRole('button', { name: notice.document_no, exact: true })).toBeVisible({
    timeout: 120_000
  })
  const guide = page.getByText('知道了', { exact: true })
  if (await guide.isVisible()) await guide.click()
  await page.getByRole('button', { name: '编辑', exact: true }).first().click()
  const editor = page.getByRole('dialog', {
    name: `编辑发货通知单 · ${notice.document_no}`,
    exact: true
  })
  await expect(editor.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'false')
  await expect(editor.getByRole('spinbutton', { name: '数量', exact: true })).toHaveValue('2.000')
  remainingPhase = 'failed'
  await editor.getByRole('button', { name: '选单', exact: true }).click()
  const picker = page.getByRole('dialog', { name: '选单 · 销售订单明细', exact: true })
  const sourceSelect = picker.getByRole('combobox', { name: '选择销售订单', exact: true })
  await expect(sourceSelect).toBeDisabled()
  await expect.poll(() => remainingRequests.length).toBe(1)
  await expect(picker.getByText('订单剩余明细加载失败', { exact: true })).toBeVisible()
  await expect(picker.getByRole('button', { name: '添加所选明细', exact: true })).toBeDisabled()
  await picker.screenshot({
    path: info.outputPath('locked-order-remaining-error.png'),
    animations: 'disabled'
  })
  const retry = picker.getByRole('button', { name: '重新加载', exact: true })
  remainingPhase = 'recovered'
  await retry.focus()
  await page.keyboard.press('Enter')
  const row = picker.getByRole('row').filter({ hasText: 'RETRY-M2' })
  await expect(row).toBeInViewport()
  await expect(row).toContainText('4')
  await expect(picker.getByText('RETRY-M1', { exact: true })).toHaveCount(0)
  await expect(sourceSelect).toBeDisabled()
  expect(remainingRequests).toEqual([
    { source: `eq.${source.id}`, tenant: `eq.${tenant.id}`, kind: 'eq.shipping_notice' },
    { source: `eq.${source.id}`, tenant: `eq.${tenant.id}`, kind: 'eq.shipping_notice' }
  ])

  await picker.getByRole('button', { name: '取消', exact: true }).click()
  await expect(picker).toBeHidden()
  remainingPhase = 'held'
  await editor.getByRole('button', { name: '选单', exact: true }).click()
  await expect.poll(() => heldRemaining.length).toBe(1)
  await expect(picker.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'true')
  await page.keyboard.press('Escape')
  await expect(picker).toBeHidden()
  await editor.getByRole('button', { name: '选单', exact: true }).click()
  await expect.poll(() => heldRemaining.length).toBe(2)
  const oldResponse = page.waitForResponse(
    (response) => response.request() === heldRemaining[0].request()
  )
  await heldRemaining[0].fulfill({ json: remainingRows })
  await (await oldResponse).finished()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(picker.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'true')
  await expect(picker.getByRole('button', { name: '添加所选明细', exact: true })).toBeDisabled()
  await heldRemaining[1].fulfill({ json: remainingRows })
  await expect(picker.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'false')
  await expect(row).toBeInViewport()
  expect(remainingRequests).toEqual([
    { source: `eq.${source.id}`, tenant: `eq.${tenant.id}`, kind: 'eq.shipping_notice' },
    { source: `eq.${source.id}`, tenant: `eq.${tenant.id}`, kind: 'eq.shipping_notice' },
    { source: `eq.${source.id}`, tenant: `eq.${tenant.id}`, kind: 'eq.shipping_notice' },
    { source: `eq.${source.id}`, tenant: `eq.${tenant.id}`, kind: 'eq.shipping_notice' }
  ])
  for (const attempt of remainingAttempts)
    expect(attempt).toEqual({
      source: `eq.${source.id}`,
      tenant: `eq.${tenant.id}`,
      kind: 'eq.shipping_notice'
    })
  await row.locator('label.el-checkbox').click()
  await expect(row.getByRole('checkbox')).toBeChecked()
  await picker.getByRole('button', { name: '添加所选明细', exact: true }).click()
  await expect(picker).toBeHidden()
  const quantities = editor.getByRole('spinbutton', { name: '数量', exact: true })
  await expect(quantities).toHaveCount(2)
  await expect(quantities.nth(0)).toHaveValue('2.000')
  await expect(quantities.nth(1)).toHaveValue('4.000')
  const descriptions = editor.getByRole('textbox', { name: '物料描述', exact: true })
  await expect(descriptions.nth(0)).toHaveValue('原有发货物料')
  await expect(descriptions.nth(1)).toHaveValue('可补入物料')
  await editor.screenshot({
    path: info.outputPath('locked-order-remaining-recovered.png'),
    animations: 'disabled'
  })
  await editor.getByRole('button', { name: '取消', exact: true }).click()
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})
