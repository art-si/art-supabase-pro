import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

const tenantA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const tenantB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const expenseItem = (tenantId: string) => ({
  id:
    tenantId === tenantA
      ? '11111111-1111-4111-8111-111111111111'
      : '22222222-2222-4222-8222-222222222222',
  tenant_id: tenantId,
  item_code: tenantId === tenantA ? 'A-ITEM' : 'B-ITEM',
  item_name: tenantId === tenantA ? '甲租户费用项目' : '乙租户费用项目',
  parent_id: null,
  business_category: null,
  is_selectable: false,
  reimbursement_allowed: false,
  is_enabled: true,
  sort: 1,
  tenant: {
    id: tenantId,
    tenant_code: tenantId === tenantA ? 'A' : 'B',
    tenant_name: tenantId === tenantA ? '租户甲' : '租户乙'
  }
})

test('费用项目跟随 shell 租户切换并在列表失败后页内重试', async ({ page }, info) => {
  test.setTimeout(180_000)
  let listCalls = 0
  let tenantListCalls = 0
  const requestScopes: Array<string | null> = []
  const queryTenantIds: Array<string | null> = []
  let failUntilRetry = false
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/sys_tenant')) {
      tenantListCalls += 1
      return route.fulfill({
        json: [
          { id: tenantA, tenant_code: 'A', tenant_name: '租户甲', status: '1' },
          { id: tenantB, tenant_code: 'B', tenant_name: '租户乙', status: '1' }
        ]
      })
    }
    if (url.pathname.endsWith('/tms_expense_item')) {
      const tenantId = url.searchParams.get('tenant_id')?.replace('eq.', '') ?? null
      listCalls += 1
      requestScopes.push(route.request().headers()['x-art-tenant-scope'] ?? null)
      queryTenantIds.push(tenantId)
      if (failUntilRetry) {
        return route.fulfill({ status: 400, json: { code: 'P0001', message: '测试列表失败' } })
      }
      const rows = tenantId ? [expenseItem(tenantId)] : [expenseItem(tenantA), expenseItem(tenantB)]
      return route.fulfill({
        json: rows,
        headers: { 'content-range': `0-${rows.length - 1}/${rows.length}` }
      })
    }
    return route.fulfill({ json: [] })
  })

  await page.goto('/tests/e2e/fixtures/fms-expense-item-scope.html', {
    waitUntil: 'domcontentloaded'
  })
  const workspace = page.locator('.business-workspace-page')
  await expect(workspace).toBeVisible()
  await expect(workspace.getByText('甲租户费用项目')).toBeVisible()
  await expect(workspace.getByText('乙租户费用项目')).toBeVisible()
  expect(listCalls).toBe(1)
  expect(tenantListCalls).toBe(1)
  expect(requestScopes).toEqual([null])
  await expect(workspace.getByText('所属租户', { exact: true })).toHaveCount(1)

  await page.getByRole('button', { name: '切至租户甲' }).click()
  await expect(workspace.getByText('乙租户费用项目')).toHaveCount(0)
  await expect(workspace.getByText('甲租户费用项目')).toBeVisible()
  expect(listCalls).toBe(2)
  expect(requestScopes.at(-1)).toBe(tenantA)

  failUntilRetry = true
  await page.getByRole('button', { name: '切至租户乙' }).click()
  await expect(workspace.getByText('数据加载失败')).toBeVisible()
  await expect(workspace.getByText('暂无费用项目')).toHaveCount(0)
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  expect(requestScopes.at(-1)).toBe(tenantB)
  // Platform table reads remove a redundant tenant_id filter; the scope header reaches RLS.
  expect(queryTenantIds.every((id) => id === null)).toBe(true)
  expect(tenantListCalls).toBe(1)
  const callsBeforeRetry = listCalls
  failUntilRetry = false
  await workspace.getByRole('button', { name: '重新加载' }).click()
  await expect(workspace.getByText('乙租户费用项目')).toBeVisible()
  expect(listCalls).toBe(callsBeforeRetry + 1)
  expect(requestScopes.at(-1)).toBe(tenantB)

  await page.setViewportSize({ width: 1280, height: 800 })
  await workspace.screenshot({ path: info.outputPath('expense-item-1280.png') })
  await page.setViewportSize({ width: 570, height: 900 })
  await workspace.screenshot({ path: info.outputPath('expense-item-570.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
