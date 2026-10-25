import { expect, test, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('采购表单最近价格失败重试及迟到结果保护', async ({ page }, testInfo) => {
  const tenant = await prepareIsolatedSession(page)
  const errors: string[] = []
  const resizeErrors: string[] = []
  page.on('console', (message) => {
    if (message.text().startsWith('resize-observer-error')) resizeErrors.push(message.text())
  })
  await page.addInitScript(() => {
    window.addEventListener(
      'error',
      (event) => {
        if (event.message.includes('ResizeObserver'))
          console.warn('resize-observer-error', event.message)
      },
      true
    )
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'scm', name: '测试供应链管理', baseUrl: '/scm/' }] })
  )
  const path = '/scm/purchase-management/purchase-order'
  const menu = {
    id: 'recent-price-form',
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
      ...['View', 'Edit', 'RecentPrice'].map((action) => ({
        ...menu,
        id: `price-${action}`,
        parentId: menu.id,
        name: `ScmPurchaseOrder:${action}`,
        path: '',
        component: '',
        type: 'button'
      }))
    ]
  })
  const document = {
    id: 'purchase-price',
    tenant_id: tenant.id,
    kind: 'purchase_order',
    document_no: 'TEST-PRICE',
    document_date: '2026-10-05',
    status: 'draft',
    source_id: null,
    supplier_id: null,
    details: {},
    subtotal: 10,
    tax_amount: 0,
    total_amount: 10,
    remark: '',
    payment_plans: [],
    delivery_plans: [],
    clauses: [],
    lines: [
      {
        line_id: 'price-line',
        material_id: 'price-material',
        material_description: '测试价格物料',
        material_code: 'M1',
        quantity: 1,
        unit: '件',
        unit_price: 10,
        discount_rate: 0,
        tax_rate: 0,
        gift: false
      }
    ]
  }
  let failure = true
  let hold = false
  let requests = 0
  const pending: Route[] = []
  await page.route('**/rest/v1/scm_purchase_document?**', (route) => {
    const params = new URL(route.request().url()).searchParams
    if (params.get('select') === 'lines' && params.has('status')) {
      requests++
      if (hold) {
        pending.push(route)
        return
      }
      return failure
        ? route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
        : route.fulfill({ json: [{ lines: [{ material_id: 'price-material', unit_price: 12 }] }] })
    }
    if (params.has('id')) return route.fulfill({ json: document })
    if (params.get('kind') !== 'eq.purchase_order') return route.fulfill({ json: [] })
    return route.fulfill({ json: [document], headers: { 'content-range': '0-0/1' } })
  })
  await page.goto(`#${path}`)
  const edit = page.getByRole('button', { name: '编辑', exact: true }).first()
  await expect(edit).toBeVisible({ timeout: 90_000 })
  const guide = page.getByText('知道了', { exact: true })
  if (await guide.isVisible()) await guide.click()
  await edit.click()
  const dialog = page.getByRole('dialog', { name: '编辑采购订单 · TEST-PRICE', exact: true })
  const load = dialog.getByRole('button', { name: '获取最近采购价', exact: true })
  const price = dialog.getByRole('spinbutton', { name: '单价', exact: true })
  await expect(price).toHaveValue('10.0000')
  await load.click()
  await expect(page.getByText('当前账号没有此操作权限', { exact: true })).toBeVisible()
  await expect(price).toHaveValue('10.0000')
  failure = false
  await load.click()
  await expect(price).toHaveValue('12.0000')
  await page.screenshot({
    path: testInfo.outputPath('recent-price-loaded.png'),
    animations: 'disabled'
  })
  hold = true
  await load.click()
  await expect.poll(() => pending.length).toBe(1)
  await expect(load).toBeDisabled()
  const count = requests
  await load.evaluate((element: HTMLButtonElement) => element.click())
  expect(requests).toBe(count)
  await price.fill('21')
  await price.blur()
  const response = page.waitForResponse((value) => value.url() === pending[0].request().url())
  await pending[0].fulfill({
    json: [{ lines: [{ material_id: 'price-material', unit_price: 75 }] }]
  })
  await response
  await expect(load).toBeEnabled()
  await expect(price).toHaveValue('21.0000')
  await load.click()
  await expect.poll(() => pending.length).toBe(2)
  await dialog.getByRole('button', { name: '关闭此对话框', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await edit.click()
  await expect(price).toHaveValue('10.0000')
  const oldResponse = page.waitForResponse((value) => value.url() === pending[1].request().url())
  await pending[1].fulfill({
    json: [{ lines: [{ material_id: 'price-material', unit_price: 99 }] }]
  })
  await oldResponse
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(price).toHaveValue('10.0000')
  await expect(load).toBeEnabled()
  expect(errors).toEqual([])
  await testInfo.attach('resize-observer-diagnostics', {
    body: JSON.stringify(resizeErrors),
    contentType: 'application/json'
  })
  expect(resizeErrors).toEqual([])
})
