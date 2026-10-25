import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

test('费用项目树保留跨页加载的末级节点', async ({ page }) => {
  test.setTimeout(180_000)
  await prepareIsolatedSession(page)
  const menu = {
    id: 'expense-menu',
    parentId: null,
    name: 'FinanceExpenseItem',
    path: '/fms/settlement/expense-item',
    component: '/fms/settlement/expense-item',
    type: 'menu',
    sort: 1,
    meta: { title: '费用项目', is_enable: true, is_hide: false, roles: [] }
  }
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'fms', name: '测试财务', baseUrl: '/fms/' }] })
  )
  await mockApplicationMenus(page, {
    fms: [
      menu,
      {
        ...menu,
        id: 'expense-view',
        parentId: menu.id,
        name: 'FinanceExpenseItem:View',
        path: '',
        component: '',
        type: 'button'
      }
    ]
  })
  const records = Array.from({ length: 1001 }, (_, index) => ({
    id: `expense-${index}`,
    tenant_id: 'permission-test-tenant',
    parent_id: index === 0 ? null : 'expense-0',
    item_code: `EXP-${index}`,
    item_name: index === 0 ? '跨页费用分组' : `费用叶项-${index}`,
    is_selectable: index !== 0,
    is_enabled: true,
    reimbursement_allowed: true,
    business_category: 'transport',
    sort: index,
    remark: ''
  }))
  const offsets: number[] = []
  await page.route('**/rest/v1/tms_expense_item?*', (route) => {
    const params = new URL(route.request().url()).searchParams
    const offset = Number(params.get('offset') || 0)
    const limit = Math.min(Number(params.get('limit') || 1000), 1000)
    offsets.push(offset)
    const data = records.slice(offset, offset + limit)
    return route.fulfill({
      headers: {
        'content-range': `${offset}-${offset + data.length - 1}/${records.length}`,
        'access-control-expose-headers': 'content-range'
      },
      json: data
    })
  })
  await page.goto('#/fms/settlement/expense-item', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '费用项目', exact: true })).toBeVisible({
    timeout: 60_000
  })
  const lastLeaf = page.getByText('费用叶项-1000', { exact: true })
  await expect(lastLeaf).toBeVisible({ timeout: 60_000 })
  await lastLeaf.scrollIntoViewIfNeeded()
  await expect(lastLeaf).toBeInViewport()
  expect(offsets).toEqual([0, 500, 1000])
  await expect(
    page.locator('.el-table__body-wrapper').first().locator('tr.el-table__row')
  ).toHaveCount(1001)
})
