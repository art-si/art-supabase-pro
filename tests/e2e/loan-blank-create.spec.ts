import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)

test('两条空白借款新增、组织树、收款明细与撤权恢复', async ({ page }, info) => {
  const tenant = '11111111-1111-4111-8111-111111111111'
  type Draft = {
    p_payload: Record<string, unknown>
    p_items: Array<Record<string, unknown>>
    p_payees: Array<Record<string, unknown>>
  }
  const saved: Draft[] = []
  const attempts: Draft[] = []
  let fail = true
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    if (name === 'sys_dictionary') {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      const values =
        code === 'fmsSettlementMethod'
          ? [['bank_transfer', '银行转账']]
          : code === 'fmsPayeeType'
            ? [['person', '个人']]
            : []
      return route.fulfill({
        json: values.map(([value, label]) => ({
          id: value,
          code: value,
          value,
          label,
          status: '1',
          dict_type_table: { code }
        }))
      })
    }
    if (name === 'mdm_organization')
      return route.fulfill({
        json: [
          {
            id: 'group',
            parent_id: null,
            organization_type: 'group',
            organization_name: '验收集团'
          },
          {
            id: 'company',
            parent_id: 'group',
            organization_type: 'company',
            organization_name: '验收公司'
          },
          ...[1, 2].map((index) => ({
            id: `department-${index}`,
            parent_id: 'company',
            organization_type: 'department',
            organization_name: `验收部门${index}`
          }))
        ].map((row) => ({ ...row, tenant_id: tenant, organization_code: row.id, status: '1' }))
      })
    if (name === 'fms_list_expense_applicants_secure')
      return route.fulfill({
        json: {
          records: [
            {
              id: 'employee',
              tenantId: tenant,
              employeeName: '验收员工',
              employeeNo: 'QA001',
              organizationId: 'department-1'
            }
          ],
          total: 1,
          fieldAccess: {}
        }
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
            item_code: 'LOAN',
            item_name: '验收借款费',
            is_selectable: true,
            is_enabled: true,
            sort: 1
          }
        ]
      })
    if (name === 'fms_list_loan_payee_options_secure')
      return route.fulfill({
        json: [
          {
            id: 'payee',
            payee_name: '验收收款人',
            bank_name: '验收银行',
            bank_account: 'MOCK-1234',
            account_name: '验收收款人',
            employee_id: 'employee',
            is_default: true
          }
        ]
      })
    if (name === 'save_fms_travel_loan_draft_secure') {
      const body = route.request().postDataJSON()
      attempts.push(body)
      if (fail)
        return route.fulfill({
          status: 409,
          json: { code: 'P0001', message: '借款草稿保存失败，请重试' }
        })
      saved.push(body)
      return route.fulfill({ json: { id: `new-${saved.length}`, status: 'draft' } })
    }
    if (name === 'fms_travel_loan')
      return route.fulfill({
        json: saved.map((row, index) => ({
          id: `new-${index + 1}`,
          loan_no: `QA-NEW-LOAN-${index + 1}`,
          status: 'draft',
          applicant_name: '验收员工',
          loan_amount: row.p_items.reduce((sum, item) => sum + Number(item.amount), 0),
          ...row.p_payload
        })),
        headers: {
          'content-range': saved.length ? `0-${saved.length - 1}/${saved.length}` : '*/0',
          'access-control-expose-headers': 'content-range'
        }
      })
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_loan&theme=${theme}&permissionControls=1&permissions=FinanceLoanApplication:View,FinanceLoanApplication:Add`
  )
  if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
  for (const index of [1, 2]) {
    const before = attempts.length
    await page.getByRole('button', { name: '新增借款单', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '新增借款单', exact: true })
    const save = dialog.getByRole('button', { name: '保存草稿', exact: true })
    await save.click()
    expect(attempts).toHaveLength(before)
    await dialog.getByPlaceholder('选择借款人', { exact: true }).click()
    const picker = page.getByRole('dialog', { name: '选择员工', exact: true })
    await picker.getByText('验收员工', { exact: true }).click()
    await picker.getByRole('button', { name: '确定', exact: true }).click()
    await expect(dialog).toContainText('申请人公司：验收公司')
    await expect(dialog.locator('.el-form-item').filter({ hasText: '职位' })).toContainText(
      '验收职位'
    )
    await dialog.getByRole('combobox', { name: '费用承担部门' }).click()
    for (const name of ['验收集团', '验收公司'])
      await page
        .getByRole('treeitem', { name, exact: true })
        .locator('.el-tree-node__expand-icon')
        .first()
        .click()
    if (index === 2)
      await page.screenshot({ path: info.outputPath('loan-organization-tree.png'), fullPage: true })
    await page.getByRole('treeitem', { name: `验收部门${index}`, exact: true }).click()
    await dialog.getByRole('textbox', { name: /借款事由/ }).fill(`新增借款事由${index}`)
    await dialog.getByRole('button', { name: '新增明细', exact: true }).click()
    const item = page.getByRole('dialog', { name: '新增借款明细', exact: true })
    await item.getByRole('combobox', { name: '费用项目' }).click()
    await page.getByRole('treeitem', { name: '验收借款费', exact: true }).click()
    await item.getByRole('textbox', { name: /借款用途/ }).fill(`借款用途${index}`)
    const amount = item.getByRole('spinbutton', { name: '借款金额（元）' })
    await amount.clear()
    await item.getByRole('button', { name: '添加明细', exact: true }).click()
    await expect(item).toContainText('借款金额须大于零')
    await amount.fill(String(index * 100))
    await item.getByRole('button', { name: '添加明细', exact: true }).click()
    await expect(item).not.toBeVisible()
    await dialog.getByRole('button', { name: '新增收款', exact: true }).click()
    const payee = page.getByRole('dialog', { name: '添加收款信息', exact: true })
    await payee.getByRole('combobox', { name: /收款人$/, exact: false }).click()
    await page.getByRole('option', { name: /验收收款人/ }).click()
    await expect(payee.getByRole('textbox', { name: /银行账号/ })).toHaveValue('MOCK-1234')
    await payee.getByRole('spinbutton', { name: '收款金额（元）' }).fill(String(index * 100))
    await payee.getByRole('button', { name: '添加收款明细', exact: true }).click()
    await expect(payee).not.toBeVisible()
    if (index === 2) {
      await dialog.getByText('MOCK-1234', { exact: true }).scrollIntoViewIfNeeded()
      await dialog.screenshot({ path: info.outputPath('loan-create-filled.png') })
    }
    await page.keyboard.press('Alt+Shift+4')
    await save.click()
    await expect(page.locator('.el-message--warning')).toContainText('操作范围或权限已变化')
    expect(attempts).toHaveLength(before)
    await page.keyboard.press('Alt+Shift+5')
    await save.click()
    if (index === 1) {
      await expect(page.locator('.el-message--error')).toContainText('借款草稿保存失败')
      await expect(dialog.getByRole('textbox', { name: /借款事由/ })).toHaveValue('新增借款事由1')
      fail = false
      await save.click()
    }
    await expect(dialog).not.toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: `QA-NEW-LOAN-${index}` })).toContainText(
      `${index * 100}.00`
    )
    expect(saved[index - 1].p_payload).toMatchObject({
      tenant_id: tenant,
      applicant_employee_id: 'employee',
      expense_department_id: `department-${index}`,
      reason: `新增借款事由${index}`
    })
    expect(saved[index - 1].p_payload.id).toBeUndefined()
    expect(saved[index - 1].p_items).toEqual([
      expect.objectContaining({
        expense_item_id: 'expense',
        borrower_employee_id: 'employee',
        amount: index * 100,
        purpose: `借款用途${index}`
      })
    ])
    expect(saved[index - 1].p_payees).toEqual([
      expect.objectContaining({
        payee_information_id: 'payee',
        bank_account: 'MOCK-1234',
        amount: index * 100
      })
    ])
    expect(saved[index - 1].p_items[0].id).toBeUndefined()
    expect(saved[index - 1].p_payees[0].id).toBeUndefined()
    await expect(page.locator('.el-message')).toHaveCount(0)
  }
  await expect(page.getByText('共 2 条', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('loan-new-two-records.png'), fullPage: true })
})
