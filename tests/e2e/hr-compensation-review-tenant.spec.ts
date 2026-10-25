import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test('调薪周期新增使用认证租户，编辑保留跨租户记录的实际归属', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)
  await page.setViewportSize({ width: 570, height: 900 })
  const home = '11111111-1111-4111-8111-111111111111'
  const other = '22222222-2222-4222-8222-222222222222'
  const id = '33333333-3333-4333-8333-333333333333'
  const cycle = {
    id,
    tenant_id: other,
    cycle_code: 'MERIT-OTHER',
    cycle_name: '跨租户调薪周期',
    review_year: 2026,
    currency_code: 'CNY',
    status: 'draft',
    recommendation_due_date: '2026-11-01',
    calibration_due_date: '2026-11-15',
    effective_date: '2026-12-01',
    default_budget_percent: 5,
    guideline_min_percent: 0,
    guideline_max_percent: 10
  }
  const scopes: Array<string | null> = []
  let saved: { p_id: string; p_payload: Record<string, unknown> } | undefined
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const url = route.request().url()
    if (url.includes('/sys_tenant?'))
      return route.fulfill({
        json: [
          { id: home, tenant_name: '平台租户', tenant_code: 'PLATFORM', status: '1' },
          { id: other, tenant_name: '业务租户', tenant_code: 'BUSINESS', status: '1' }
        ]
      })
    if (url.includes('hr_list_business_organization_options_secure')) {
      const body = route.request().postDataJSON()
      scopes.push(body.p_tenant_id)
      return route.fulfill({
        json: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            tenant_id: body.p_tenant_id,
            organization_name: body.p_tenant_id === home ? '平台组织' : '业务组织',
            organization_code: 'ORG',
            organization_type: 'department',
            parent_id: null,
            status: '1'
          }
        ]
      })
    }
    if (url.includes('hr_compensation_review_overview_secure'))
      return route.fulfill({ json: { cycle_count: 1, amount_access: true, selected_cycle: cycle } })
    if (url.includes('hr_list_compensation_review_options_secure'))
      return route.fulfill({
        json: [{ id, tenant_id: other, name: cycle.cycle_name, status: 'draft' }]
      })
    if (url.includes('hr_list_compensation_review_records_secure'))
      return route.fulfill({
        json: {
          records: route.request().postDataJSON().p_kind === 'cycle' ? [cycle] : [],
          total: route.request().postDataJSON().p_kind === 'cycle' ? 1 : 0,
          amount_access: true
        }
      })
    if (url.includes('hr_save_compensation_review_record_secure')) {
      saved = route.request().postDataJSON()
      return route.fulfill({ json: id })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/hr-all-pages.html?page=operations/compensation-review')
  await expect(page.locator('.business-workspace-page')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('#review-command-title')).toHaveText(cycle.cycle_name)
  await page.getByRole('button', { name: '新增调薪周期', exact: true }).first().click()
  const add = page.getByRole('dialog', { name: '新增调薪周期', exact: true })
  await expect(add).toBeVisible()
  await expect.poll(() => scopes.includes(home)).toBe(true)
  expect(scopes).not.toContain(null)
  await add.getByRole('combobox', { name: '组织范围', exact: true }).click()
  await expect(
    page.locator('.el-tree-select__popper:visible').getByText('平台组织 · ORG')
  ).toBeVisible()
  await add.getByText('新增调薪周期', { exact: true }).click()
  await add.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('tab', { name: /^组织预算/ }).click()
  await page.getByRole('button', { name: '新增组织预算', exact: true }).first().click()
  const budget = page.getByRole('dialog', { name: '新增组织预算', exact: true })
  await expect(budget).toBeVisible()
  await expect.poll(() => scopes.at(-1)).toBe(other)
  await budget.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('tab', { name: /^调薪周期/ }).click()
  const row = page.locator('.el-table__body tr').filter({ hasText: 'MERIT-OTHER' }).first()
  await row.getByRole('button', { name: '更多操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '编辑规则', exact: true }).click()
  const edit = page.getByRole('dialog', { name: '编辑调薪周期', exact: true })
  await expect(edit.getByRole('textbox', { name: /周期名称$/ })).toHaveValue('跨租户调薪周期')
  await expect.poll(() => scopes.includes(other)).toBe(true)
  const tenant = edit.getByRole('combobox', { name: '所属租户', exact: true })
  if (await tenant.count()) await expect(tenant).toBeDisabled()
  await edit.getByRole('textbox', { name: /周期名称$/ }).fill('更新后的跨租户周期')
  await page.screenshot({
    path: testInfo.outputPath('cycle-tenant-edit.png'),
    animations: 'disabled'
  })
  await edit.getByRole('button', { name: '保存更改', exact: true }).click()
  await expect.poll(() => saved?.p_id).toBe(id)
  expect(saved?.p_payload.tenant_id).toBe(other)
  expect(saved?.p_payload.cycle_name).toBe('更新后的跨租户周期')
  expect(saved?.p_payload.cycle_code).toBe('MERIT-OTHER')
  expect(errors).toEqual([])
})
