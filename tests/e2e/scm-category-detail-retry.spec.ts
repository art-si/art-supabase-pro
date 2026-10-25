import { expect, test, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('报价分类费用失败重试并拒绝关闭前旧响应', async ({ page }, testInfo) => {
  const tenant = await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'scm', name: '测试供应链管理', baseUrl: '/scm/' }] })
  )
  const path = '/scm/sales-quotation/item-category'
  const menu = {
    id: 'category-detail-retry',
    parentId: null,
    name: 'ScmQuoteCategory',
    path,
    component: path,
    type: 'menu',
    sort: 1,
    meta: { title: '报价项分类', is_enable: true, is_hide: false, roles: [] }
  }
  await mockApplicationMenus(page, {
    scm: [
      menu,
      {
        ...menu,
        id: 'category-detail-view',
        parentId: menu.id,
        name: 'ScmQuoteCategory:View',
        path: '',
        component: '',
        type: 'button'
      }
    ]
  })
  await page.route('**/rest/v1/scm_quote_category?**', (route) =>
    route.fulfill({
      json: [
        {
          id: 'category-1',
          tenant_id: tenant.id,
          category_name: '测试报价分类',
          project_id: 'project-1',
          quantity: 1,
          unit_price: 10,
          fee_total: 2,
          total_amount: 12,
          fee_items: [{ expense_id: 'expense-1', amount: 2 }],
          quotation_no: null,
          remark: '测试备注'
        }
      ],
      headers: { 'content-range': '0-0/1' }
    })
  )
  let fails = true
  let holdNext = false
  const pending: Route[] = []
  const expense = {
    id: 'expense-1',
    tenant_id: tenant.id,
    expense_name: '当前费用名称',
    expense_code: 'F1'
  }
  await page.route('**/rest/v1/scm_quote_expense?**', (route) => {
    expect(new URL(route.request().url()).searchParams.get('tenant_id')).toBe(`eq.${tenant.id}`)
    if (holdNext) {
      holdNext = false
      pending.push(route)
      return
    }
    return fails
      ? route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
      : route.fulfill({ json: [expense] })
  })
  await page.goto(`#${path}`)
  const view = page.getByRole('button', { name: '查看', exact: true }).first()
  await expect(view).toBeVisible({ timeout: 90_000 })
  const guide = page.getByText('知道了', { exact: true })
  if (await guide.isVisible()) await guide.click()
  await view.click()
  const drawer = page.getByRole('dialog', { name: '查看报价项分类', exact: true })
  await expect(drawer.getByText('费用名称加载失败', { exact: true })).toBeVisible()
  await drawer.getByRole('button', { name: '重新加载', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('category-error.png'), animations: 'disabled' })
  fails = false
  await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(drawer.getByText('当前费用名称（F1）', { exact: true })).toBeVisible()
  await drawer.locator('.el-drawer__close-btn').click()
  await expect(drawer).not.toBeVisible()
  holdNext = true
  await view.click()
  await expect.poll(() => pending.length).toBe(1)
  await drawer.locator('.el-drawer__close-btn').click()
  await expect(drawer).not.toBeVisible()
  await view.click()
  await expect(drawer.getByText('当前费用名称（F1）', { exact: true })).toBeVisible()
  const lateResponse = page.waitForResponse((response) =>
    response.url().includes('/scm_quote_expense?')
  )
  await pending[0].fulfill({ json: [{ ...expense, expense_name: '旧费用名称不得出现' }] })
  await lateResponse
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(drawer.getByText('当前费用名称（F1）', { exact: true })).toBeVisible()
  await expect(drawer.getByText('旧费用名称不得出现（F1）', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
  await drawer.getByText('当前费用名称（F1）', { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath('category-current.png'),
    animations: 'disabled'
  })
})
