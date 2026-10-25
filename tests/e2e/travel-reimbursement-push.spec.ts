import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120000)

test('两张已通过出差申请带入报销并保存新草稿，来源失败可恢复', async ({ page }, info) => {
  const tenant = '11111111-1111-4111-8111-111111111111'
  const applications = [1, 2].map((index) => ({
    id: `application-${index}`,
    tenant_id: tenant,
    application_no: `QA-APP-${index}`,
    status: 'approved',
    applicant_employee_id: 'employee',
    applicant_name: '验收员工',
    assignment_id: 'assignment',
    expense_department_id: 'department',
    requested_amount: index * 100,
    reason: `已通过出差事由${index}`,
    multiple_travelers: false,
    attachment_urls: [],
    itineraries: [
      {
        id: `itinerary-${index}`,
        expense_item_id: 'expense',
        project_id: null,
        requested_amount: index * 100,
        end_date: '2026-10-25',
        departure_place: '北京',
        destination_place: '唐山'
      }
    ]
  }))
  const saved: Array<{
    p_payload: Record<string, unknown>
    p_lines: Array<Record<string, unknown>>
    p_payees: Array<Record<string, unknown>>
  }> = []
  const records: Array<Record<string, unknown>> = []
  const prepared: string[] = []
  let failPrepare = true
  let failSave = true
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    if (name === 'sys_dictionary') {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      const pairs =
        code === 'fmsSettlementMethod'
          ? [['bank_transfer', '银行转账']]
          : code === 'fmsPayeeType'
            ? [['person', '个人']]
            : []
      return route.fulfill({
        json: pairs.map(([value, label]) => ({
          id: value,
          code: value,
          value,
          label,
          status: '1',
          dict_type_table: { code }
        }))
      })
    }
    if (name === 'fms_travel_application')
      return route.fulfill({
        json: url.searchParams.get('id')?.startsWith('eq.')
          ? applications.find((row) => `eq.${row.id}` === url.searchParams.get('id'))
          : applications
      })
    if (name === 'prepare_fms_travel_application_reimbursement_secure') {
      const id = route.request().postDataJSON().p_application_id
      prepared.push(id)
      if (failPrepare) {
        failPrepare = false
        return route.fulfill({
          status: 503,
          json: { code: 'P0001', message: '出差来源暂不可用，请重试' }
        })
      }
      return route.fulfill({ json: applications.find((row) => row.id === id) })
    }
    if (name === 'mdm_organization')
      return route.fulfill({
        json: [
          {
            id: 'company',
            tenant_id: tenant,
            organization_name: '验收公司',
            organization_type: 'company',
            parent_id: null,
            status: '1'
          },
          {
            id: 'department',
            tenant_id: tenant,
            organization_name: '验收部门',
            organization_type: 'department',
            parent_id: 'company',
            status: '1'
          }
        ]
      })
    if (name === 'mdm_employee')
      return route.fulfill({
        json: [
          {
            id: 'employee',
            tenant_id: tenant,
            employee_name: '验收员工',
            employee_no: 'QA001',
            organization_id: 'department'
          }
        ]
      })
    if (name === 'mdm_employee_assignment')
      return route.fulfill({
        json: [{ id: 'assignment', business_title: '验收职位', primary_assignment: true }]
      })
    if (name === 'tms_expense_item')
      return route.fulfill({
        json: [
          {
            id: 'expense',
            item_name: '验收差旅费',
            is_enabled: true,
            is_selectable: true,
            reimbursement_allowed: true,
            parent_id: null
          }
        ]
      })
    if (name === 'fms_list_reimbursement_payee_options_secure')
      return route.fulfill({
        json: [
          {
            id: 'payee',
            tenant_id: tenant,
            payee_name: '隔离收款人',
            bank_name: '验收银行',
            bank_account: 'MOCK-ONLY-1234'
          }
        ]
      })
    if (name === 'fms_list_expense_reimbursements_secure')
      return route.fulfill({ json: { records, total: records.length } })
    if (name === 'fms_save_travel_reimbursement_draft_secure') {
      if (failSave) {
        failSave = false
        return route.fulfill({
          status: 409,
          json: { code: 'P0001', message: '报销保存失败，请重试' }
        })
      }
      const body = route.request().postDataJSON()
      saved.push(body)
      records.push({
        ...body.p_payload,
        id: `new-${saved.length}`,
        reimbursement_no: `QA-APP-REIMBURSE-${saved.length}`,
        source_type: 'travel',
        status: 'draft',
        total_amount: body.p_lines[0].gross_amount
      })
      return route.fulfill({ json: { id: `new-${saved.length}`, status: 'draft' } })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  const openSource = async (index: number) => {
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_travel&arNavigation=1&theme=${theme}&permissions=FinanceTravelApplication:View,FinanceTravelApplication:PushReimbursement,FinanceExpenseReimbursement:View,FinanceExpenseReimbursement:Add`
    )
    const row = page.getByRole('row').filter({ hasText: `QA-APP-${index}` })
    await row.getByRole('button', { name: '查看', exact: true }).click()
    const view = page.getByRole('dialog', { name: `查看出差申请 · QA-APP-${index}`, exact: true })
    await expect(view).toBeVisible()
    await expect(view.getByRole('textbox', { name: '* 申请人', exact: true })).toBeDisabled()
    await expect(view.getByRole('button', { name: '保存草稿', exact: true })).toHaveCount(0)
    await expect(view.getByRole('button', { name: '添加行程', exact: true })).toHaveCount(0)
    await view.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    await expect(view).toBeHidden()
    await page
      .getByRole('row')
      .filter({ hasText: `QA-APP-${index}` })
      .getByRole('button', { name: '下推差旅报销', exact: true })
      .click()
  }
  await openSource(1)
  await expect(page.getByText('出差来源暂不可用，请重试', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  for (const index of [1, 2]) {
    await openSource(index)
    const dialog = page.getByRole('dialog', {
      name: `出差申请下推报销 · QA-APP-${index}`,
      exact: true
    })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: /报销事由$/ })).toHaveValue(
      `已通过出差事由${index}`
    )
    await expect(dialog.getByPlaceholder('选择报销人', { exact: true })).toBeDisabled()
    await expect(dialog).toContainText('验收差旅费')
    await expect(dialog).toContainText(`¥${index * 100}.00`)
    await dialog.getByRole('button', { name: '新增收款', exact: true }).click()
    const payee = page.getByRole('dialog', { name: '添加收款信息', exact: true })
    await payee.getByRole('combobox', { name: /收款人$/ }).click()
    await page.getByRole('option', { name: /隔离收款人/ }).click()
    await payee.getByRole('button', { name: '添加收款明细', exact: true }).click()
    await expect(payee).toBeHidden()
    await dialog.screenshot({ path: info.outputPath(`application-${index}-reimbursement.png`) })
    await dialog.getByRole('button', { name: '保存草稿', exact: true }).click()
    if (index === 1) {
      await expect(page.getByText('报销保存失败，请重试', { exact: true })).toBeVisible()
      await dialog.getByRole('button', { name: '保存草稿', exact: true }).click()
    }
    await expect(dialog).toBeHidden()
    await expect(page.getByText(`QA-APP-REIMBURSE-${index}`, { exact: true })).toBeVisible()
  }
  expect(prepared).toEqual(['application-1', 'application-1', 'application-2'])
  expect(saved).toHaveLength(2)
  for (const [index, body] of saved.entries()) {
    expect(body.p_payload).toMatchObject({
      tenant_id: tenant,
      applicant_employee_id: 'employee',
      expense_department_id: 'department',
      travel_application_id: `application-${index + 1}`
    })
    expect(body.p_payload.id).toBeUndefined()
    expect(body.p_lines[0]).toMatchObject({
      expense_item_id: 'expense',
      gross_amount: (index + 1) * 100,
      reimbursee_employee_id: 'employee'
    })
    expect(body.p_payees[0]).toMatchObject({
      payee_information_id: 'payee',
      amount: (index + 1) * 100
    })
  }
})
