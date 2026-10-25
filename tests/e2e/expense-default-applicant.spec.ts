import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

for (const [kind, permission, button, title] of [
  ['expense_travel', 'FinanceTravelApplication', '新增出差申请', '新增出差申请'],
  ['expense_loan', 'FinanceLoanApplication', '新增借款单', '新增借款单']
]) {
  test(`${kind} 默认申请人从租户员工资料补齐公司而非依赖登录缓存`, async ({ page }) => {
    const tenant = '11111111-1111-4111-8111-111111111111'
    const referenceQueries: URL[] = []
    let mutations = 0
    let employee = 'employee-1'
    await page.route('**/rest/v1/**', (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const name = url.pathname.split('/').at(-1)
      if (name === 'mdm_employee') {
        referenceQueries.push(url)
        return route.fulfill({
          json: [
            {
              id: employee,
              tenant_id: tenant,
              employee_no: employee,
              employee_name: `默认员工${employee}`,
              organization_id: 'department'
            }
          ]
        })
      }
      if (name === 'mdm_organization')
        return route.fulfill({
          json: [
            {
              id: 'company',
              tenant_id: tenant,
              parent_id: null,
              organization_type: 'company',
              organization_name: '默认员工所属公司',
              organization_code: 'COMPANY',
              status: '1'
            },
            {
              id: 'department',
              tenant_id: tenant,
              parent_id: 'company',
              organization_type: 'department',
              organization_name: '默认员工部门',
              organization_code: 'DEPARTMENT',
              status: '1'
            }
          ]
        })
      if (name === 'mdm_employee_assignment')
        return route.fulfill({
          json: [{ id: 'assignment', business_title: '默认职位', primary_assignment: true }]
        })
      if (request.method() === 'POST' && /save|upsert|create/.test(name || '')) mutations++
      return route.fulfill({ json: [] })
    })
    for (employee of ['employee-1', 'employee-2']) {
      await page.goto(
        `/tests/e2e/fixtures/receivable-workspace.html?kind=${kind}&employeeId=${employee}&permissions=${permission}:View,${permission}:Add`
      )
      await page.getByRole('button', { name: button, exact: true }).click()
      const dialog = page.getByRole('dialog', { name: title, exact: true })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('textbox', { name: '* 申请人', exact: true })).toHaveValue(
        `默认员工${employee} · ${employee}`
      )
      await expect(dialog).toContainText('申请人公司：默认员工所属公司')
      await expect(dialog).toContainText('默认职位')
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      await expect(dialog).toBeHidden()
    }
    expect(referenceQueries.length).toBeGreaterThanOrEqual(2)
    for (const query of referenceQueries)
      expect(query.searchParams.get('tenant_id')).toBe(`eq.${tenant}`)
    expect(mutations).toBe(0)
  })
}
