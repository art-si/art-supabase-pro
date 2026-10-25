import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(180_000)

test('采购订单逐行批量操作、收料带入和参选布局', async ({ page }, testInfo) => {
  const tenant = await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const path = '/scm/purchase-management/purchase-order'
  const menu = {
    id: 'request-test',
    parentId: null,
    name: 'ScmPurchaseOrder',
    path,
    component: path,
    type: 'menu',
    sort: 1,
    meta: { title: '采购订单', is_enable: true, is_hide: false, roles: [] }
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
        name: `ScmPurchaseOrder:${action}`,
        path: '',
        component: '',
        type: 'button'
      })),
      {
        ...menu,
        id: 'order-add',
        parentId: menu.id,
        name: 'ScmReceiptNotice:Add',
        path: '',
        component: '',
        type: 'button'
      }
    ]
  })
  const request = {
    id: 'request-1',
    tenant_id: tenant.id,
    kind: 'purchase_order',
    document_no: 'QA-ORDER-001',
    document_date: '2026-10-09',
    status: 'draft',
    project_id: 'project',
    source_id: null,
    supplier_id: 'supplier',
    details: {
      buyer: 'buyer',
      buyer_name: '测试采购员',
      keeper: 'keeper',
      keeper_name: '测试库管员'
    },
    subtotal: 140,
    tax_amount: 0,
    total_amount: 140,
    remark: '测试打印备注',
    payment_plans: [],
    delivery_plans: [],
    clauses: [],
    lines: [10, 20].map((quantity, index) => ({
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
  await page.route('**/rest/v1/scm_purchase_document?**', (route) => {
    const params = new URL(route.request().url()).searchParams
    if (params.get('id')?.startsWith('eq.')) return route.fulfill({ json: request })
    const rows = params.get('kind') === 'eq.purchase_order' ? [request] : []
    return route.fulfill({
      json: rows,
      headers: {
        'content-range': rows.length ? '0-0/1' : '*/0',
        'access-control-expose-headers': 'content-range'
      }
    })
  })
  await page.route('**/rest/v1/rpc/scm_purchase_line_progress_secure', (route) =>
    route.fulfill({
      json: request.lines.map((line) => ({
        document_id: request.id,
        line_id: line.line_id,
        delivered_quantity: 6,
        received_quantity: 3,
        returned_quantity: 1
      }))
    })
  )
  const failCheck = false
  const operations: Array<{
    p_action: string
    p_selections: Array<{ document_id: string; line_ids: string[] }>
  }> = []
  await page.route('**/rest/v1/rpc/scm_purchase_delete_dependencies_secure', (route) =>
    failCheck
      ? route.fulfill({ status: 500, json: { code: 'XX000', message: 'internal error' } })
      : route.fulfill({ json: [] })
  )
  await page.route('**/rest/v1/rpc/scm_purchase_batch_secure', (route) => {
    operations.push(route.request().postDataJSON())
    return route.fulfill({ json: 1 })
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
  await page.route('**/rest/v1/mdm_project?**', (route) =>
    route.fulfill({
      json: [{ id: 'project', tenant_id: tenant.id, project_code: 'PJ', project_name: '测试项目' }]
    })
  )
  await page.route('**/rest/v1/mdm_supplier?**', (route) =>
    route.fulfill({
      json: [
        { id: 'supplier', tenant_id: tenant.id, supplier_code: 'S', supplier_name: '测试供应商' }
      ]
    })
  )
  await page.route('**/rest/v1/rpc/scm_purchase_suppliers_secure', (route) =>
    route.fulfill({
      json: [
        { id: 'supplier', tenant_id: tenant.id, supplier_code: 'S', supplier_name: '测试供应商' }
      ]
    })
  )
  await page.goto(`#${path}`)
  await expect(page.getByRole('button', { name: 'QA-ORDER-001', exact: true }).first()).toBeVisible(
    { timeout: 120_000 }
  )
  const guide = page.getByText('知道了', { exact: true })
  if (await guide.isVisible()) await guide.click()
  await expect(page.getByRole('button', { name: '选单', exact: true })).toHaveCount(0)
  await page.getByRole('radio', { name: '按明细' }).locator('..').click()
  const rows = page.locator('.el-table__body-wrapper tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(page.getByText('已送货数量', { exact: true })).toBeVisible()
  await expect(page.getByText('未入库数量', { exact: true })).toBeVisible()
  await expect(rows.nth(0)).toContainText('6')
  let printed = 0
  await page.exposeFunction('recordPurchasePrint', () => {
    printed += 1
  })
  await page.evaluate(() => {
    window.print = () => {
      void (window as unknown as { recordPurchasePrint: () => Promise<void> }).recordPurchasePrint()
    }
  })
  await rows.nth(1).getByRole('checkbox').locator('..').click()
  await page.getByRole('button', { name: '批量打印', exact: true }).click()
  await expect.poll(() => printed).toBe(1)
  const printSheet = page.locator('.purchase-request-print-sheet')
  await expect(printSheet).toContainText('采购订单')
  await expect(printSheet).toContainText('购货金额')
  await expect(printSheet).toContainText('QA-ORDER-001')
  await page.emulateMedia({ media: 'print' })
  await page.screenshot({ path: testInfo.outputPath('purchase-order-print.png') })
  await page.emulateMedia({ media: 'screen' })
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await page.getByRole('button', { name: '批量复制', exact: true }).click()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect.poll(() => operations.length).toBe(1)
  expect(operations[0].p_selections).toEqual([{ document_id: request.id, line_ids: ['line-2'] }])
  await rows.nth(0).getByRole('checkbox').locator('..').click()
  await page.getByRole('button', { name: '提交', exact: true }).click()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect.poll(() => operations.length).toBe(2)
  expect(operations[1].p_action).toBe('submit')
  request.status = 'approved'
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await rows.nth(0).getByRole('checkbox').locator('..').click()
  await page.getByRole('button', { name: '下推收料通知单', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增收料通知单', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: '采购员', exact: true })).toHaveValue(
    '测试采购员'
  )
  await expect(dialog.getByRole('textbox', { name: '库管员', exact: true })).toHaveValue(
    '测试库管员'
  )
  await expect(
    dialog.locator('.el-form-item').filter({ hasText: '项目名称' }).first()
  ).not.toHaveClass(/is-required/)
  await expect(
    dialog.locator('.el-form-item').filter({ hasText: '供应商全称' }).first()
  ).toHaveClass(/is-required/)
  await expect(dialog.getByLabel('单价')).toHaveValue('5.0000')
  await page.screenshot({
    path: testInfo.outputPath('receipt-inherited-fields.png'),
    animations: 'disabled'
  })
  await page.setViewportSize({ width: 1024, height: 768 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.screenshot({ path: testInfo.outputPath('receipt-narrow.png'), animations: 'disabled' })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  expect(errors).toEqual([])
})
