import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(180_000)

test('销售合同逐行删除、空数量和报价余量，订单实际交货数量与物料参选', async ({
  page
}, testInfo) => {
  const tenant = await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const contractPath = '/scm/sales-management/sales-contract'
  const orderPath = '/scm/sales-management/sales-order'
  const menus = [
    { id: 'contract', name: 'ScmSalesContract', path: contractPath, title: '销售合同' },
    { id: 'order', name: 'ScmSalesOrder', path: orderPath, title: '销售订单' }
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
        ['View', 'Add', 'Edit', 'Delete', 'Copy', 'Submit', 'Terminate', 'Archive', 'Push'].map(
          (action) => ({
            ...menu,
            id: `${menu.id}-${action}`,
            parentId: menu.id,
            name: `${menu.name}:${action}`,
            path: '',
            component: '',
            type: 'button'
          })
        )
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
    sales_unit: '',
    auxiliary_unit: '千克',
    auxiliary_unit2: '米',
    auxiliary_quantity: 30,
    auxiliary_quantity2: 40,
    quantity,
    unit_price: 5,
    tax_rate: 13,
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
    details: { title: '测试合同' },
    lines,
    project: { project_name: '测试项目', project_code: 'PJ' }
  }
  const contract = {
    ...base,
    id: 'contract-doc',
    kind: 'sales_contract',
    document_no: 'QA-CONTRACT',
    document_type_id: 'framework',
    status: 'draft'
  }
  const order = {
    ...base,
    id: 'order-doc',
    kind: 'sales_order',
    document_no: 'QA-SALES-ORDER',
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
    if (params.get('id')?.startsWith('eq.'))
      return route.fulfill({ json: params.get('id') === 'eq.contract-doc' ? contract : order })
    const rows =
      params.get('kind') === 'eq.sales_contract'
        ? [contract]
        : params.get('kind') === 'eq.sales_quotation'
          ? [quotation]
          : params.get('kind') === 'eq.sales_order'
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
        sales_unit: '件'
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
  await page.route('**/rest/v1/mdm_material?**', (route) =>
    route.fulfill({
      json: [
        ...lines,
        { material_id: 'material-2', material_code: 'QA-M2', material_description: '测试物料3' }
      ].map((line) => ({
        id: line.material_id,
        tenant_id: tenant.id,
        material_code: line.material_code,
        material_name: line.material_description,
        description: line.material_description,
        basic_unit: '件',
        base_unit_id: 'unit',
        sales_unit_id: 'unit',
        material_source: 'purchase',
        category_id: 'category',
        baseUnitRecord: { unit_name: '件' },
        salesUnit: { unit_name: '件' },
        unit_conversions: []
      }))
    })
  )
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
  await page.route('**/rest/v1/sys_menu?**', (route) =>
    route.fulfill({ json: { id: 'contract', name: 'ScmSalesContract' } })
  )
  await page.route('**/rest/v1/mdm_document_type?**', (route) =>
    route.fulfill({
      json: [
        {
          id: 'framework',
          tenant_id: tenant.id,
          document_type_name: '框架销售合同',
          document_type_code: 'FRAME',
          is_default: true
        }
      ]
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
  await page.goto(`#${contractPath}`)
  await expect(page.getByRole('button', { name: 'QA-CONTRACT', exact: true })).toBeVisible({
    timeout: 120_000
  })
  const guide = page.getByText('知道了', { exact: true })
  if (await guide.isVisible()) await guide.click()
  await page.getByRole('radio', { name: '按明细' }).locator('..').click()
  const rows = page.locator('.el-table__body-wrapper tbody tr')
  await expect(rows).toHaveCount(2)
  await rows.nth(1).getByRole('checkbox').locator('..').click()
  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect.poll(() => operations.length).toBe(1)
  expect(operations[0]).toEqual({
    p_selections: [{ document_id: 'contract-doc', line_ids: ['line-2'] }]
  })
  await page.getByRole('button', { name: '编辑', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: '编辑销售合同 · QA-CONTRACT', exact: true })
  await expect(dialog).toBeVisible()
  const quantityHeader = dialog.getByRole('columnheader', { name: '数量', exact: true })
  await expect(quantityHeader).toBeVisible()
  await dialog.getByRole('button', { name: '参选报价明细', exact: true }).click()
  const picker = page.getByRole('dialog', { name: '参选报价明细', exact: true })
  await expect(picker.getByRole('columnheader', { name: '项目名称', exact: true })).toBeVisible()
  await expect(picker.getByRole('columnheader', { name: '基本单位', exact: true })).toBeVisible()
  await expect(picker.getByRole('columnheader', { name: '已转数量', exact: true })).toBeVisible()
  await expect(picker.getByRole('columnheader', { name: '待转数量', exact: true })).toBeVisible()
  await expect(picker.locator('tbody tr').first()).toContainText('8')
  await page.screenshot({
    path: testInfo.outputPath('quotation-remaining-columns.png'),
    animations: 'disabled'
  })
  await picker.getByRole('button', { name: '取消', exact: true }).click()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await page.goto(`#${orderPath}`)
  await expect(page.getByRole('button', { name: 'QA-SALES-ORDER', exact: true })).toBeVisible()
  await page.getByRole('radio', { name: '按明细' }).locator('..').click()
  for (const [label, expected] of [
    ['已发货通知数量', ['4', '0']],
    ['已出库数量', ['2', '0']],
    ['已退库数量', ['1', '0']],
    ['未交货数量', ['7', '20']]
  ] as const) {
    const header = page.getByRole('columnheader', { name: label, exact: true })
    const cls = (await header.getAttribute('class'))
      ?.split(' ')
      .find((name) => /^el-table_\d+_column_/.test(name))
    await expect(page.locator(`.el-table__body-wrapper td.${cls}`)).toHaveText([...expected])
  }
  await expect(page.getByRole('columnheader', { name: '销售数量', exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('sales-order-progress.png'),
    animations: 'disabled'
  })
  await page.getByRole('button', { name: '编制', exact: true }).first().click()
  const orderDialog = page.getByRole('dialog', {
    name: '编辑销售订单 · QA-SALES-ORDER',
    exact: true
  })
  await orderDialog.getByRole('button', { name: '添加物料', exact: true }).click()
  const materialPicker = page.getByRole('dialog', { name: '参选物料编码', exact: true })
  await expect(materialPicker.getByText('物料分类', { exact: true })).toBeVisible()
  await expect(materialPicker.getByText('原材料', { exact: true })).toBeVisible()
  await expect(materialPicker.getByText('已选 0', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('material-three-panels.png'),
    animations: 'disabled'
  })
  await materialPicker
    .getByRole('row')
    .filter({ hasText: 'QA-M2' })
    .getByRole('checkbox')
    .locator('..')
    .click()
  await expect(materialPicker.getByText('已选 1', { exact: true })).toBeVisible()
  await materialPicker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(
    orderDialog.getByRole('spinbutton', { name: '数量', exact: true }).last()
  ).toHaveValue('')
  await page.setViewportSize({ width: 1024, height: 768 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.screenshot({
    path: testInfo.outputPath('sales-order-narrow.png'),
    animations: 'disabled'
  })
  await orderDialog.getByRole('button', { name: '取消', exact: true }).click()
  order.status = 'approved'
  await page.reload()
  await expect(page.getByRole('button', { name: 'QA-SALES-ORDER', exact: true })).toBeVisible()
  await page.getByRole('radio', { name: '按明细' }).locator('..').click()
  await page
    .locator('.el-table__body-wrapper tbody tr')
    .nth(1)
    .getByRole('checkbox')
    .locator('..')
    .click()
  await page.getByRole('button', { name: '下推发货通知单', exact: true }).click()
  const shippingDialog = page.getByRole('dialog', { name: '新增发货通知单', exact: true })
  await expect(shippingDialog).toBeVisible()
  await expect(shippingDialog.getByRole('spinbutton', { name: '数量', exact: true })).toHaveCount(1)
  await expect(shippingDialog.getByRole('spinbutton', { name: '数量', exact: true })).toHaveValue(
    '20.000'
  )
  await expect(shippingDialog.locator('tbody')).toContainText('千克')
  await expect(shippingDialog.locator('tbody')).toContainText('米')
  await shippingDialog.getByRole('button', { name: '取消', exact: true }).click()
  expect(errors).toEqual([])
})
