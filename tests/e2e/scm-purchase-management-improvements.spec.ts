import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(180_000)

test('采购申请明细选择、引用重试、复制提交及打印', async ({ page }, testInfo) => {
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
    if (params.get('kind') === 'eq.purchase_order')
      return route.fulfill({
        json: [
          {
            id: 'order-1',
            source_id: request.id,
            status: 'draft',
            lines: [
              {
                source_line_id: 'line-1',
                source_purchase_document_id: request.id,
                source_quantity: 3,
                quantity: 3
              }
            ]
          }
        ]
      })
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
  let failCheck = true
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
  await page.goto(`#${path}`)
  await expect(
    page.getByRole('button', { name: 'QA-REQUEST-001', exact: true }).first()
  ).toBeVisible({ timeout: 120_000 })
  const guide = page.getByText('知道了', { exact: true })
  if (await guide.isVisible()) await guide.click()
  await expect(page.getByRole('button', { name: '选单', exact: true })).toHaveCount(0)
  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await expect(page.locator('.business-workspace-header')).not.toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.business-workspace-header')).toBeVisible()
  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await page.getByRole('button', { name: /退出专注/ }).click()
  await expect(page.locator('.business-workspace-header')).toBeVisible()
  await page.getByRole('radio', { name: '按明细' }).locator('..').click()
  const rows = page.locator('.el-table__body-wrapper tbody tr')
  await expect(rows).toHaveCount(2)
  for (const [label, values] of [
    ['已采购数量', ['3', '0']],
    ['未采购数量', ['7', '20']]
  ] as const) {
    const header = page.locator('.el-table__header-wrapper th').filter({ hasText: label })
    const columnClass = (await header.getAttribute('class'))
      ?.split(' ')
      .find((name) => /^el-table_\d+_column_/.test(name))
    expect(columnClass).toBeTruthy()
    const cells = page.locator(`.el-table__body-wrapper td.${columnClass}`)
    await expect(cells).toHaveText([...values])
    await expect(cells.first()).not.toHaveAttribute('rowspan', '2')
  }
  await rows.nth(1).getByRole('checkbox').locator('..').click()
  await expect(page.getByRole('button', { name: '批量复制', exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('request-selected-details.png'),
    animations: 'disabled'
  })
  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  const checkDialog = page.getByRole('dialog', { name: '删除检查未完成' })
  await expect(checkDialog).toBeVisible()
  expect(operations).toHaveLength(0)
  failCheck = false
  await checkDialog.getByRole('button', { name: /重新检查|重试/ }).click()
  await expect(checkDialog).not.toBeVisible()
  await page.getByRole('button', { name: '批量复制', exact: true }).click()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect.poll(() => operations.length).toBe(1)
  expect(operations[0]).toEqual({
    p_action: 'copy',
    p_selections: [{ document_id: request.id, line_ids: ['line-2'] }],
    p_buyer_id: null
  })
  await rows.nth(0).getByRole('checkbox').locator('..').click()
  await page.getByRole('button', { name: '提交', exact: true }).click()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect.poll(() => operations.length).toBe(2)
  expect(operations[1].p_action).toBe('submit')
  await rows.nth(0).getByRole('checkbox').locator('..').click()
  await page.evaluate(() => {
    window.print = () => {}
  })
  await page.getByRole('button', { name: '打印', exact: true }).click()
  await expect(page.locator('.purchase-request-print-sheet')).toContainText('测试采购员')
  await page.emulateMedia({ media: 'print' })
  await page.screenshot({ path: testInfo.outputPath('request-print.png') })
  await page.emulateMedia({ media: 'screen' })
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.screenshot({ path: testInfo.outputPath('request-narrow.png'), animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: '下推采购订单', exact: true }).click()
  const orderDialog = page.getByRole('dialog', { name: '新增采购订单', exact: true })
  await expect(orderDialog).toBeVisible()
  const supplierField = orderDialog
    .locator('.el-form-item')
    .filter({ hasText: '供应商全称' })
    .first()
  await expect(supplierField).toHaveClass(/is-required/)
  await expect(supplierField.locator('input')).toBeEnabled()
  await supplierField.locator('input').click()
  await expect(page.getByRole('dialog', { name: '参选供应商', exact: true })).toBeVisible()
  await page
    .getByRole('dialog', { name: '参选供应商', exact: true })
    .getByRole('button', { name: '取消', exact: true })
    .click()
  await page.screenshot({
    path: testInfo.outputPath('pushed-order-supplier.png'),
    animations: 'disabled'
  })
  await orderDialog.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '新增采购申请', exact: true }).click()
  const requestDialog = page.getByRole('dialog', { name: '新增采购申请', exact: true })
  await expect(
    requestDialog.locator('.el-form-item').filter({ hasText: '项目名称' }).first()
  ).not.toHaveClass(/is-required/)
  await page.screenshot({
    path: testInfo.outputPath('request-optional-project.png'),
    animations: 'disabled'
  })
  await requestDialog.getByRole('button', { name: '取消', exact: true }).click()
  await page.goto(`#${contractMenu.path}`)
  await page.getByRole('button', { name: '新增采购合同', exact: true }).click()
  const contractDialog = page.getByRole('dialog', { name: '新增采购合同', exact: true })
  await expect(
    contractDialog.locator('.el-form-item').filter({ hasText: '项目名称' }).first()
  ).not.toHaveClass(/is-required/)
  await expect(
    contractDialog.locator('.el-form-item').filter({ hasText: '供应商全称' }).first()
  ).toHaveClass(/is-required/)
  await page.screenshot({
    path: testInfo.outputPath('contract-required-supplier.png'),
    animations: 'disabled'
  })
  await contractDialog.getByRole('button', { name: '取消', exact: true }).click()
  expect(errors).toEqual([])
})
