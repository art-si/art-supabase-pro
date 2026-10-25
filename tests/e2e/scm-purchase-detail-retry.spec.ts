import { expect, test, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('采购详情失败可重试且旧单据不会覆盖新单据', async ({ page }, testInfo) => {
  const tenant = await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'scm', name: '测试供应链管理', baseUrl: '/scm/' }] })
  )
  const path = '/scm/purchase-management/purchase-order'
  const menu = {
    id: 'purchase-detail-retry',
    parentId: null,
    name: 'ScmPurchaseOrder',
    path,
    component: path,
    type: 'menu',
    sort: 1,
    meta: { title: '采购订单', is_enable: true, is_hide: false, roles: [] }
  }
  await mockApplicationMenus(page, {
    scm: [
      menu,
      {
        ...menu,
        id: 'purchase-detail-view',
        parentId: menu.id,
        name: 'ScmPurchaseOrder:View',
        path: '',
        component: '',
        type: 'button'
      }
    ]
  })
  const documents = [1, 2].map((index) => ({
    id: `purchase-${index}`,
    tenant_id: tenant.id,
    kind: 'purchase_order',
    document_no: `TEST-PURCHASE-${index}`,
    document_date: '2026-10-05',
    status: 'draft',
    source_id: null,
    supplier_id: null,
    details: {},
    subtotal: 10,
    tax_amount: 0,
    total_amount: 10,
    remark: `当前采购记录${index}`,
    payment_plans: [],
    delivery_plans: [],
    clauses: [],
    lines: [
      {
        line_id: `line-${index}`,
        line_no: 1,
        material_id: 'material-1',
        material_description: `测试采购物料${index}`,
        material_code: 'M1',
        quantity: 1,
        unit: '件',
        unit_price: 10,
        discount_rate: 0,
        tax_rate: 0,
        gift: false
      }
    ]
  }))
  let fails = true
  let emptyDetail = false
  let holdNext = false
  const pending: Route[] = []
  await page.route('**/rest/v1/scm_purchase_document?**', (route) => {
    const id = new URL(route.request().url()).searchParams.get('id')
    if (!id) return route.fulfill({ json: documents, headers: { 'content-range': '0-1/2' } })
    if (holdNext) {
      holdNext = false
      pending.push(route)
      return
    }
    if (fails)
      return route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
    if (emptyDetail) return route.fulfill({ json: null })
    return route.fulfill({ json: documents.find((document) => id === `eq.${document.id}`) })
  })
  await page.route('**/rest/v1/rpc/scm_purchase_order_inbound_progress_secure', (route) =>
    route.fulfill({ json: [] })
  )
  let unitFailure = false
  await page.route('**/rest/v1/mdm_unit_of_measure?**', (route) =>
    unitFailure
      ? route.fulfill({ status: 500, json: { code: 'XX000', message: 'technical unit failure' } })
      : route.fulfill({ json: [] })
  )
  let unnecessaryReads = 0
  await page.route('**/rest/v1/mdm_material?**', (route) => {
    unnecessaryReads++
    return route.fulfill({ json: [] })
  })
  await page.goto(`#${path}`)
  const first = page.getByRole('button', { name: 'TEST-PURCHASE-1', exact: true }).first()
  const second = page.getByRole('button', { name: 'TEST-PURCHASE-2', exact: true }).first()
  await expect(first).toBeVisible({ timeout: 90_000 })
  const guide = page.getByText('知道了', { exact: true })
  if (await guide.isVisible()) await guide.click()
  await first.click()
  const drawer = page.getByRole('dialog', { name: '查看采购订单', exact: true })
  await expect(drawer.getByText('采购详情加载失败', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('purchase-error.png'), animations: 'disabled' })
  fails = false
  await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(drawer.getByText('当前采购记录1', { exact: true })).toBeVisible()
  await drawer.locator('.el-drawer__close-btn').click()
  await expect(drawer).not.toBeVisible()
  emptyDetail = true
  await first.click()
  await expect(
    drawer.getByText('该记录暂无可读取详情，请刷新列表或重新加载', { exact: true })
  ).toBeVisible()
  await expect(drawer.getByText('当前采购记录1', { exact: true })).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath('purchase-missing.png'),
    animations: 'disabled'
  })
  emptyDetail = false
  await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(drawer.getByText('当前采购记录1', { exact: true })).toBeVisible()
  await drawer.locator('.el-drawer__close-btn').click()
  await expect(drawer).not.toBeVisible()
  unitFailure = true
  await first.click()
  await expect(drawer.getByText('采购详情加载失败', { exact: true })).toBeVisible()
  unitFailure = false
  await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(drawer.getByText('当前采购记录1', { exact: true })).toBeVisible()
  await drawer.locator('.el-drawer__close-btn').click()
  await expect(drawer).not.toBeVisible()
  holdNext = true
  await first.click()
  await expect.poll(() => pending.length).toBe(1)
  await drawer.locator('.el-drawer__close-btn').click()
  await expect(drawer).not.toBeVisible()
  await second.click()
  await expect(drawer.getByText('当前采购记录2', { exact: true })).toBeVisible()
  const lateProgress = page.waitForResponse((response) =>
    response.url().includes('scm_purchase_order_inbound_progress_secure')
  )
  await pending[0].fulfill({ json: { ...documents[0], remark: '旧采购记录不得覆盖当前记录' } })
  await lateProgress
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(drawer.getByText('当前采购记录2', { exact: true })).toBeVisible()
  await expect(drawer.getByText('旧采购记录不得覆盖当前记录', { exact: true })).toHaveCount(0)
  expect(unnecessaryReads).toBe(0)
  expect(errors).toEqual([])
  await page.screenshot({
    path: testInfo.outputPath('purchase-current.png'),
    animations: 'disabled'
  })
  await drawer.getByText('测试采购物料2', { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('purchase-lines.png'), animations: 'disabled' })
})
