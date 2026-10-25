import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(180_000)

test('采购申请连续分批下单、剩余数量和超量拦截', async ({ page }, testInfo) => {
  const tenant = await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const path = '/scm/purchase-management/purchase-request'
  const menu = {
    id: 'request-test',
    parentId: null,
    name: 'ScmPurchaseRequest',
    path,
    component: path,
    type: 'menu',
    sort: 1,
    meta: { title: '采购申请', is_enable: true, is_hide: false, roles: [] }
  }
  const contractMenu = {
    ...menu,
    id: 'contract-test',
    name: 'ScmPurchaseContract',
    path: '/scm/purchase-management/purchase-contract',
    component: '/scm/purchase-management/purchase-contract',
    meta: { ...menu.meta, title: '采购合同' }
  }
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'scm', name: '测试供应链', baseUrl: '/scm/' }] })
  )
  await mockApplicationMenus(page, {
    scm: [
      menu,
      contractMenu,
      ...['View', 'Add', 'Edit', 'Delete'].map((action) => ({
        ...contractMenu,
        id: `contract-${action}`,
        parentId: contractMenu.id,
        name: `ScmPurchaseContract:${action}`,
        path: '',
        component: '',
        type: 'button'
      })),
      ...['View', 'Add', 'Edit', 'Delete', 'Copy', 'Submit', 'Print', 'Push'].map((action) => ({
        ...menu,
        id: `request-${action}`,
        parentId: menu.id,
        name: `ScmPurchaseRequest:${action}`,
        path: '',
        component: '',
        type: 'button'
      })),
      {
        ...menu,
        id: 'order-add',
        parentId: menu.id,
        name: 'ScmPurchaseOrder:Add',
        path: '',
        component: '',
        type: 'button'
      }
    ]
  })
  const request = {
    id: 'request-1',
    tenant_id: tenant.id,
    kind: 'purchase_request',
    document_no: 'QA-REQUEST-001',
    document_date: '2026-10-09',
    status: 'draft',
    project_id: null,
    source_id: null,
    supplier_id: null,
    details: { applicant_name: '测试申请人', buyer_name: '测试采购员', department: '测试部门' },
    subtotal: 140,
    tax_amount: 0,
    total_amount: 140,
    remark: '测试打印备注',
    payment_plans: [],
    delivery_plans: [],
    clauses: [],
    lines: [10].map((quantity, index) => ({
      line_id: `line-${index + 1}`,
      line_no: (index + 1) * 10,
      material_id: `material-${index}`,
      material_code: `QA-M${index}`,
      material_description: `测试物料${index + 1}`,
      specification: '',
      unit: '件',
      quantity,
      unit_price: 5,
      tax_rate: 13,
      discount_rate: 0,
      gift: false,
      reason: '测试用途'
    }))
  }
  const orders: Array<{
    id: string
    source_id: string
    status: string
    lines: Array<{
      source_line_id: string
      source_quantity: number
      base_quantity: number
      quantity: number
    }>
  }> = []
  await page.route('**/rest/v1/scm_purchase_document?**', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      const used = orders.reduce((sum, order) => sum + order.lines[0].source_quantity, 0)
      if (used + body.lines[0].source_quantity > 10)
        return route.fulfill({
          status: 400,
          json: { code: '23514', message: '转单数量超过来源单据未转换数量' }
        })
      const order = { ...body, id: `order-${orders.length + 1}`, status: 'draft' }
      orders.push(order)
      return route.fulfill({ json: order })
    }
    const params = new URL(route.request().url()).searchParams
    if (params.get('kind') === 'eq.purchase_order') return route.fulfill({ json: orders })
    if (params.get('kind') === 'eq.purchase_contract')
      return route.fulfill({
        json: [],
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
      })
    if (params.get('id')?.startsWith('eq.')) return route.fulfill({ json: request })
    return route.fulfill({
      json: [request],
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  })
  await page.route('**/rest/v1/mdm_material?**', (route) =>
    route.fulfill({
      json: request.lines.map((line) => ({
        id: line.material_id,
        tenant_id: tenant.id,
        material_code: line.material_code,
        material_name: line.material_description,
        basic_unit: '件',
        base_unit_id: 'unit-piece',
        purchase_unit_id: 'unit-piece',
        baseUnitRecord: { unit_name: '件' },
        purchaseUnit: { unit_name: '件' },
        unit_conversions: []
      }))
    })
  )

  await page.route('**/rest/v1/sys_menu?**', (route) =>
    route.fulfill({ json: [{ id: 'order-menu', name: 'ScmPurchaseOrder' }] })
  )
  await page.route('**/rest/v1/mdm_document_type?**', (route) =>
    route.fulfill({
      json: [
        {
          id: 'order-type',
          tenant_id: tenant.id,
          document_type_name: '标准采购订单',
          menu_ids: ['order-menu'],
          is_default: true,
          status: '1'
        }
      ]
    })
  )
  await page.route('**/rest/v1/rpc/scm_purchase_suppliers_secure', (route) =>
    route.fulfill({
      json: [
        { id: 'supplier', tenant_id: tenant.id, supplier_name: '测试供应商', supplier_code: 'S1' }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_supplier?**', (route) =>
    route.fulfill({
      json: [
        {
          id: 'supplier',
          tenant_id: tenant.id,
          supplier_name: '测试供应商',
          supplier_code: 'S1',
          status: '1'
        }
      ]
    })
  )
  await page.goto(`#${path}`)
  await expect(
    page.getByRole('button', { name: 'QA-REQUEST-001', exact: true }).first()
  ).toBeVisible({ timeout: 120000 })
  const guide = page.getByText('知道了', { exact: true })
  if (await guide.isVisible()) await guide.click()
  await page.getByRole('radio', { name: '按明细' }).locator('..').click()
  for (const [batch, expected] of [
    [2, 10],
    [3, 8],
    [6, 5],
    [5, 5]
  ]) {
    const selection = page.locator('.el-table__body-wrapper tbody tr').first().getByRole('checkbox')
    if (!(await selection.isChecked())) await selection.locator('..').click()
    await page.getByRole('button', { name: '下推采购订单', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '新增采购订单', exact: true })
    const quantity = dialog.getByRole('spinbutton', { name: '数量', exact: true })
    await expect(quantity).toHaveValue(expected.toFixed(3))
    const supplier = dialog
      .locator('.el-form-item')
      .filter({ hasText: '供应商全称' })
      .first()
      .locator('input')
    await supplier.click()
    const picker = page.getByRole('dialog', { name: '参选供应商', exact: true })
    await picker.getByText('测试供应商', { exact: true }).click()
    await picker.getByRole('button', { name: '确定', exact: true }).click()
    await expect(picker).not.toBeVisible()
    await quantity.fill(String(batch))
    await quantity.blur()
    await page.screenshot({
      path: testInfo.outputPath(`order-quantity-${batch}.png`),
      animations: 'disabled'
    })
    const before = orders.length
    await dialog.getByRole('button', { name: '创建单据', exact: true }).click()
    if (batch === 6) {
      await expect(page.getByText('转单数量超过来源单据未转换数量', { exact: true })).toBeVisible()
      expect(orders.length).toBe(before)
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
    } else {
      await expect(dialog).not.toBeVisible()
      expect(orders.length).toBe(before + 1)
      expect(orders.at(-1)?.lines[0].source_quantity).toBe(batch)
      expect(orders.at(-1)?.lines[0].base_quantity).toBe(batch)
    }
    await page.screenshot({
      path: testInfo.outputPath(`batch-${batch}.png`),
      animations: 'disabled'
    })
  }
  expect(orders.map((order) => order.lines[0].source_quantity)).toEqual([2, 3, 5])
  expect(errors).toEqual([])
})
