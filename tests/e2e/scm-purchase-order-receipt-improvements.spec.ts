import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { prepareAppearance } from './support/appearance'
import {
  expectCompactDocumentForm,
  expectUnifiedDocumentDetail
} from './support/scm-document-layout'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(180_000)
test.beforeEach(async ({ page }, info) => {
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
})

test('采购订单逐行批量操作、收料带入和参选布局', async ({ page }, testInfo) => {
  const tenant = await prepareIsolatedSession(page, {
    tenantId: '11111111-1111-4111-8111-111111111111',
    platformSuper: false
  })
  await page.route('**/rest/v1/sys_dictionary?*', (route) => {
    const code = new URL(route.request().url()).searchParams.get('dict_type_table.code')
    return route.fulfill({
      json:
        !code || code === 'eq.commonDocumentDisplayMode'
          ? [
              { value: 'document', label: '按单据' },
              { value: 'line', label: '按明细' }
            ].map((item, index) => ({
              ...item,
              id: `document-display-${item.value}`,
              code: item.value,
              status: '1',
              sort: index,
              dict_type_table: { code: 'commonDocumentDisplayMode', name: '单据展示方式' }
            }))
          : []
    })
  })
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
  await page.route('**/rest/v1/sys_menu?**', (route) => {
    const name = new URL(route.request().url()).searchParams.get('name')
    return name?.startsWith('in.')
      ? route.fulfill({
          json: [
            { id: menu.id, name: menu.name },
            { id: 'receipt-test', name: 'ScmReceiptNotice' }
          ]
        })
      : route.fallback()
  })
  await page.route('**/rest/v1/mdm_document_type?**', (route) =>
    route.fulfill({
      json: [
        {
          id: 'order-type',
          tenant_id: tenant.id,
          menu_ids: [menu.id],
          document_type_name: '标准采购订单',
          document_type_code: 'ORDER',
          is_default: true
        }
      ]
    })
  )
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
  const categoryQueries: Array<{ categories: string; tenant: string | null }> = []
  const pickerMaterial = {
    id: 'picker-child-material',
    tenant_id: tenant.id,
    category_id: 'picker-child',
    material_code: 'QA-PICK-CHILD',
    material_name: '验收参选物料',
    basic_unit: '件',
    base_unit_id: 'unit-piece',
    purchase_unit_id: 'unit-piece',
    baseUnitRecord: { unit_name: '件' },
    purchaseUnit: { unit_name: '件' },
    unit_conversions: []
  }
  await page.route('**/rest/v1/mdm_material_category?**', (route) =>
    route.fulfill({
      json: [
        { id: 'picker-root', category_code: 'ROOT', category_name: '验收参选父分类' },
        {
          id: 'picker-child',
          parent_id: 'picker-root',
          category_code: 'CHILD',
          category_name: '验收参选子分类'
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_material?**', (route) => {
    const params = new URL(route.request().url()).searchParams
    const categories = params.get('category_id')
    if (categories) {
      categoryQueries.push({ categories, tenant: params.get('tenant_id') })
      return route.fulfill({
        json: [pickerMaterial],
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
      })
    }
    const rows = request.lines.map((line) => ({
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
    return route.fulfill({
      json: [...rows, pickerMaterial],
      headers: { 'content-range': '0-2/3', 'access-control-expose-headers': 'content-range' }
    })
  })
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
  await page.goto(`#${path}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'QA-ORDER-001', exact: true }).first()).toBeVisible(
    { timeout: 120_000 }
  )
  const guide = page.getByText('知道了', { exact: true })
  if (await guide.isVisible()) await guide.click()
  await page.getByRole('button', { name: 'QA-ORDER-001', exact: true }).first().click()
  const detail = page.getByRole('dialog', { name: '查看采购订单', exact: true })
  await expectUnifiedDocumentDetail(detail, '测试采购员')
  await expect(detail.getByRole('tab', { name: '订单明细', exact: true })).toBeVisible()
  await detail.getByRole('tab', { name: '付款计划', exact: true }).click()
  await expect(detail.getByText('暂无付款计划', { exact: true })).toBeVisible()
  await detail.getByRole('tab', { name: '交货计划', exact: true }).click()
  await expect(detail.getByText('暂无交货计划', { exact: true })).toBeVisible()
  await detail.getByRole('button', { name: '关闭抽屉', exact: true }).click()
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
  await expectCompactDocumentForm(dialog, '收料通知单号', '采购组织')
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
  const type = dialog.locator('[data-art-form-item-key="header.documentTypeId"]')
  await expect(type.getByText('暂无可用类型', { exact: true })).toBeVisible()
  const help = type.getByText('在 MDM 启用单据类型，并关联「收料通知单」。', {
    exact: true
  })
  await expect(help).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.screenshot({ path: testInfo.outputPath('receipt-narrow.png'), animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  await help.scrollIntoViewIfNeeded()
  await expect(help).toBeInViewport({ ratio: 1 })
  expect(
    await help.evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return range.getClientRects().length
    })
  ).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await dialog.screenshot({
    path: testInfo.outputPath('receipt-missing-type-390.png'),
    animations: 'disabled'
  })
  await page.setViewportSize({ width: 1024, height: 768 })
  await dialog.getByRole('button', { name: '参选物料', exact: true }).click()
  const picker = page.getByRole('dialog', { name: '参选物料', exact: true })
  await picker.getByText('验收参选父分类', { exact: true }).click()
  await expect
    .poll(() => categoryQueries.at(-1))
    .toEqual({
      categories: 'in.(picker-root,picker-child)',
      tenant: `eq.${tenant.id}`
    })
  await picker
    .getByRole('row')
    .filter({ hasText: 'QA-PICK-CHILD' })
    .getByRole('checkbox')
    .locator('..')
    .click()
  await expect(picker.getByText('共 1 条', { exact: true })).toBeVisible()
  await picker.screenshot({
    path: testInfo.outputPath('receipt-material-parent-selection.png'),
    animations: 'disabled'
  })
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog.getByText('QA-PICK-CHILD · 验收参选物料', { exact: true })).toBeVisible()
  await expect(
    dialog.getByRole('spinbutton', { name: '明细行号', exact: true }).last()
  ).toHaveValue('20')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  expect(errors).toEqual([])
})
