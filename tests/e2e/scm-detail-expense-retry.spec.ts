import { expect, test, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('销售单据费用后页失败可重试并显示完整名称', async ({ page }, testInfo) => {
  const tenant = await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'scm', name: '测试供应链管理', baseUrl: '/scm/' }] })
  )
  const path = '/scm/sales-quotation/sales-quotation'
  const menu = {
    id: 'detail-expense-retry',
    parentId: null,
    name: 'ScmSalesQuotationDoc',
    path,
    component: path,
    type: 'menu',
    sort: 1,
    meta: { title: '销售报价单', is_enable: true, is_hide: false, roles: [] }
  }
  await mockApplicationMenus(page, {
    scm: [
      menu,
      {
        ...menu,
        id: 'detail-expense-view',
        parentId: menu.id,
        name: 'ScmSalesQuotationDoc:View',
        path: '',
        component: '',
        type: 'button'
      }
    ]
  })
  const document = {
    id: 'detail-expense-document',
    tenant_id: tenant.id,
    kind: 'sales_quotation',
    document_no: 'TEST-FEE-1001',
    document_date: '2026-10-05',
    status: 'draft',
    details: {},
    currency: 'CNY',
    subtotal: 0,
    fee_total: 10,
    total_amount: 10,
    tax_amount: 0,
    cost_total: 0,
    gross_profit: 0,
    gross_margin: 0,
    lines: [],
    fees: [{ expense_id: 'expense-1000', amount: 10, cost: 0 }],
    payment_plans: [],
    delivery_plans: [],
    clauses: [],
    source_id: null
  }
  let detailFailure = false
  let holdNextDetail = false
  const pendingDetails: Route[] = []
  await page.route('**/rest/v1/scm_sales_document?**', (route) => {
    const isDetail = new URL(route.request().url()).searchParams.has('id')
    if (isDetail && holdNextDetail) {
      holdNextDetail = false
      pendingDetails.push(route)
      return
    }
    if (isDetail && detailFailure)
      return route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
    return route.fulfill({
      json: isDetail ? { ...document, remark: '当前已核对详情' } : [document],
      headers: { 'content-range': '0-0/1' }
    })
  })
  await page.route('**/rest/v1/wf_instance?**', (route) => route.fulfill({ json: [] }))
  let unitFailure = false
  await page.route('**/rest/v1/mdm_unit_of_measure?**', (route) =>
    unitFailure
      ? route.fulfill({ status: 500, json: { code: 'XX000', message: 'technical unit failure' } })
      : route.fulfill({ json: [] })
  )
  let failurePending = true
  const offsets: number[] = []
  await page.route('**/rest/v1/scm_quote_expense?**', (route) => {
    const params = new URL(route.request().url()).searchParams
    expect(params.get('tenant_id')).toBe(`eq.${tenant.id}`)
    const offset = Number(params.get('offset') || 0)
    offsets.push(offset)
    if (failurePending && offset === 500)
      return route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
    const expenses = Array.from({ length: 1001 }, (_, index) => ({
      id: `expense-${index}`,
      tenant_id: tenant.id,
      expense_name: `测试费用${index}`,
      expense_code: `F${index}`,
      sort_order: index,
      enabled: true
    }))
    return route.fulfill({
      json: expenses.slice(offset, offset + Number(params.get('limit') || 500))
    })
  })
  await page.goto(`#${path}`)
  const number = page.getByRole('button', { name: document.document_no, exact: true }).first()
  await expect(number).toBeVisible({ timeout: 90_000 })
  const guide = page.getByText('知道了', { exact: true })
  if (await guide.isVisible()) await guide.click()
  await number.click()
  const drawer = page.getByRole('dialog', { name: '查看销售报价单', exact: true })
  await expect(drawer.getByText('费用名称加载失败', { exact: true })).toBeVisible()
  await expect(drawer.getByText('expense-1000', { exact: true })).toHaveCount(0)
  await drawer.getByRole('button', { name: '重新加载', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('expense-error.png'), animations: 'disabled' })
  failurePending = false
  await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(drawer.getByText('测试费用1000', { exact: true })).toBeVisible()
  await expect(drawer.getByText('费用名称加载失败', { exact: true })).toHaveCount(0)
  expect(offsets).toEqual([0, 500, 0, 500, 1000])
  expect(errors).toEqual([])
  await page.screenshot({
    path: testInfo.outputPath('expense-recovered.png'),
    animations: 'disabled'
  })
  await drawer.locator('.el-drawer__close-btn').click()
  await expect(drawer).not.toBeVisible()
  detailFailure = true
  await number.click()
  await expect(drawer.getByText('单据详情加载失败', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('detail-error.png'), animations: 'disabled' })
  detailFailure = false
  await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(drawer.getByText('当前已核对详情', { exact: true })).toBeVisible()
  await drawer.locator('.el-drawer__close-btn').click()
  await expect(drawer).not.toBeVisible()
  unitFailure = true
  await number.click()
  await expect(drawer.getByText('单据详情加载失败', { exact: true })).toBeVisible()
  await expect(drawer.getByText('计量单位名称加载失败，请重试', { exact: true })).toBeVisible()
  unitFailure = false
  await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(drawer.getByText('当前已核对详情', { exact: true })).toBeVisible()
  await drawer.locator('.el-drawer__close-btn').click()
  await expect(drawer).not.toBeVisible()
  holdNextDetail = true
  await number.click()
  await expect.poll(() => pendingDetails.length).toBe(1)
  await drawer.locator('.el-drawer__close-btn').click()
  await expect(drawer).not.toBeVisible()
  await number.click()
  await expect(drawer.getByText('当前已核对详情', { exact: true })).toBeVisible()
  const oldWorkflowResponse = page.waitForResponse((response) =>
    response.url().includes('/wf_instance?')
  )
  await pendingDetails[0].fulfill({ json: { ...document, remark: '旧请求详情不得覆盖当前记录' } })
  await oldWorkflowResponse
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(drawer.getByText('当前已核对详情', { exact: true })).toBeVisible()
  await expect(drawer.getByText('旧请求详情不得覆盖当前记录', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('detail-current.png'), animations: 'disabled' })
})
