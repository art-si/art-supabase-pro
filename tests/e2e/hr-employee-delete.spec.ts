import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
const employeeId = '99999999-9999-4999-8999-999999999999'

async function prepareRoster(
  page: Page,
  mode: 'blocked' | 'error' | 'clear' | 'concurrent',
  limited = false,
  dependency: 'contract' | 'performance' = 'contract'
) {
  await prepareIsolatedSession(page)
  const events: string[] = []
  let blocked = mode === 'blocked'
  let deleted = false
  await page.route('**/rest/v1/rpc/hr_list_employee_organization_scope_secure**', (route) =>
    route.fulfill({ json: [] })
  )
  await page.route('**/rest/v1/rpc/hr_list_employees_secure**', (route) =>
    route.fulfill({
      json: {
        records: deleted
          ? []
          : [
              {
                id: employeeId,
                employee_name: '测试员工',
                employee_no: 'EMP-001',
                tenant_id: 'permission-test-tenant',
                employment_status: 'active'
              }
            ],
        total: deleted ? 0 : 1,
        field_access: {}
      }
    })
  )
  await page.route('**/rest/v1/sys_tenant**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/hr_compliance_overview_secure**', (route) =>
    route.fulfill({ json: {} })
  )
  await page.route('**/rest/v1/rpc/hr_list_compliance_records_secure**', (route) => {
    const params = route.request().postDataJSON()
    return route.fulfill({
      json: {
        records:
          params.p_kind === 'contract' && params.p_keyword === 'CONTRACT-001'
            ? [
                {
                  id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
                  contract_no: 'CONTRACT-001',
                  contract_status: 'active',
                  employee: { employee_name: '测试员工', employee_no: 'EMP-001' },
                  tenant_id: 'permission-test-tenant'
                }
              ]
            : [],
        total: params.p_kind === 'contract' && params.p_keyword === 'CONTRACT-001' ? 1 : 0
      }
    })
  })
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
    events.push('inspect')
    expect(route.request().postDataJSON()).toMatchObject({
      p_table: 'mdm_employee',
      p_ids: [employeeId]
    })
    if (mode === 'error')
      return route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
    return route.fulfill({
      json: blocked
        ? [
            {
              resourceId: employeeId,
              sourceTable:
                dependency === 'contract' ? 'hr_employee_contract' : 'hr_performance_review',
              recordId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
              targetId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
              recordNo: dependency === 'contract' ? 'CONTRACT-001' : 'REVIEW-001',
              recordSummary: dependency === 'contract' ? '测试员工劳动合同' : '测试员工考核',
              recordStatus: 'active',
              createdAt: '2026-10-01T00:00:00Z'
            }
          ]
        : []
    })
  })
  await page.route('**/rest/v1/rpc/hr_delete_employee_secure**', (route) => {
    events.push('delete')
    expect(route.request().postDataJSON()).toMatchObject({ p_employee_id: employeeId })
    if (mode === 'concurrent') {
      blocked = true
      return route.fulfill({
        status: 400,
        json: { code: 'P0001', message: '员工新增了关联记录，请重新检查' }
      })
    }
    deleted = true
    return route.fulfill({ json: null })
  })
  await page.goto(
    `/tests/e2e/fixtures/hr-delete-workflows.html?page=employee${limited ? '&permission=employee-only' : ''}`
  )
  await expect(page.getByText('EMP-001', { exact: true }).first()).toBeVisible()
  await page.locator('.el-table__body-wrapper').getByRole('button', { name: '更多操作' }).click()
  await page.getByRole('menuitem', { name: '删除员工档案' }).click()
  return events
}

test('员工关联合同在确认前阻止删除并显示业务编号', async ({ page }, testInfo) => {
  const events = await prepareRoster(page, 'blocked')
  const dialog = page.getByRole('dialog', { name: '暂时无法删除员工档案' })
  await expect(dialog).toContainText('CONTRACT-001')
  await expect(dialog).toContainText('测试员工劳动合同')
  await expect(dialog).toContainText('劳动合同')
  expect(events).toEqual(['inspect'])
  await page.screenshot({
    path: testInfo.outputPath('employee-reference-blocked.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '查看关联', exact: true }).click()
  await expect(page.getByTestId('navigation-full-path')).toContainText('/hr/personnel/compliance?')
  await expect(page.getByTestId('navigation-full-path')).toContainText(
    'dependencyCode=hr_employee_contract'
  )
  await expect(page.getByTestId('navigation-full-path')).toContainText('recordNo=CONTRACT-001')
  await expect(page.getByText('用工合规中心', { exact: true })).toBeVisible()
  await expect(page.locator('.el-table__body-wrapper')).toContainText('CONTRACT-001')
  await expect(page.getByText('已找到关联记录', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('employee-contract-located.png'),
    animations: 'disabled'
  })
})

test('员工删除引用无合规查看权限时隐藏关联入口', async ({ page }) => {
  const events = await prepareRoster(page, 'blocked', true)
  const dialog = page.getByRole('dialog', { name: '暂时无法删除员工档案' })
  await expect(dialog).toContainText('CONTRACT-001')
  await expect(dialog.getByRole('button', { name: '查看关联', exact: true })).toHaveCount(0)
  expect(events).toEqual(['inspect'])
})

test('普通员工删除权限不授予绩效引用查看入口', async ({ page }) => {
  const events = await prepareRoster(page, 'blocked', true, 'performance')
  const dialog = page.getByRole('dialog', { name: '暂时无法删除员工档案' })
  await expect(dialog).toContainText('员工考核')
  await expect(dialog).toContainText('REVIEW-001')
  await expect(dialog.getByRole('button', { name: '查看关联', exact: true })).toHaveCount(0)
  expect(events).toEqual(['inspect'])
})

test('员工引用检查失败时阻止确认和写入并提供重试', async ({ page }) => {
  const events = await prepareRoster(page, 'error')
  const dialog = page.getByRole('dialog', { name: '删除检查未完成' })
  await expect(dialog).toContainText('关联资料未完成核验，删除已停止')
  await expect(dialog).toContainText('当前账号没有此操作权限')
  await dialog.getByRole('button', { name: '重新检查', exact: true }).click()
  await expect.poll(() => events.length).toBe(2)
  await expect(dialog).toContainText('关联资料未完成核验，删除已停止')
  expect(events).toEqual(['inspect', 'inspect'])
})

for (const mode of ['clear', 'concurrent'] as const) {
  test(`员工删除${mode === 'clear' ? '先校验再确认成功' : '并发拒绝后重检引用'}`, async ({
    page
  }) => {
    const events = await prepareRoster(page, mode)
    const confirmation = page.getByRole('dialog', { name: '删除员工档案' })
    await expect(confirmation).toContainText('EMP-001')
    await confirmation.getByRole('button', { name: '确认删除', exact: true }).click()
    if (mode === 'clear') {
      await expect(page.getByText('员工档案已删除', { exact: true })).toBeVisible()
      expect(events).toEqual(['inspect', 'delete'])
    } else {
      await expect(page.getByRole('dialog', { name: '暂时无法删除员工档案' })).toContainText(
        'CONTRACT-001'
      )
      expect(events).toEqual(['inspect', 'delete', 'inspect'])
    }
  })
}
