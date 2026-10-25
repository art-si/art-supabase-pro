import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)

for (const multiple of [false, true]) {
  test(`普通用户从空白创建两张${multiple ? '多报销人' : '单报销人'}报销，切换申请人后保存和提交`, async ({
    page
  }, info) => {
    const tenant = '11111111-1111-4111-8111-111111111111'
    const saved: Array<{
      p_payload: Record<string, unknown>
      p_lines: Array<Record<string, unknown>>
      p_payees: Array<Record<string, unknown>>
    }> = []
    const records: Array<Record<string, unknown>> = []
    let fail = true
    let payeeAvailable = true
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.split('/').at(-1)
      if (name === 'sys_dictionary') {
        const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
        const entries =
          code === 'commonDocumentDisplayMode'
            ? [
                ['document', '单据'],
                ['line', '明细']
              ]
            : code === 'tmsReimbursementApprovalStatus'
              ? [
                  ['draft', '草稿'],
                  ['pending_review', '审批中']
                ]
              : code === 'fmsSettlementMethod'
                ? [['bank_transfer', '银行转账']]
                : code === 'fmsPayeeType'
                  ? [['person', '个人']]
                  : []
        return route.fulfill({
          json: entries.map(([value, label]) => ({
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
      if (name === 'fms_list_expense_applicants_secure')
        return route.fulfill({
          json: {
            records: [
              {
                id: 'employee',
                tenant_id: tenant,
                employee_name: '验收员工',
                employee_no: 'QA001',
                organization_id: 'department'
              },
              {
                id: 'delegate-employee',
                tenant_id: tenant,
                employee_name: '委托员工',
                employee_no: 'QA002',
                organization_id: 'department'
              }
            ],
            total: 2,
            field_access: {}
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
              tenant_id: tenant,
              item_name: '验收报销项目',
              is_enabled: true,
              is_selectable: true,
              reimbursement_allowed: true,
              parent_id: null
            }
          ]
        })
      if (name === 'fms_list_reimbursement_payee_options_secure')
        return route.fulfill({
          json: payeeAvailable
            ? [
                {
                  id: 'payee',
                  tenant_id: tenant,
                  payee_name: '隔离收款人',
                  bank_name: '验收银行',
                  bank_account: 'MOCK-ONLY-1234'
                }
              ]
            : []
        })
      if (name === 'fms_list_expense_reimbursements_secure')
        return route.fulfill({ json: { records, total: records.length } })
      if (name === 'fms_save_travel_reimbursement_draft_secure') {
        if (fail) {
          fail = false
          return route.fulfill({
            status: 409,
            json: { code: 'P0001', message: '收款资料已更新，请核对后重试' }
          })
        }
        const body = route.request().postDataJSON()
        if (
          !body.p_payload.multiple_reimbursees &&
          body.p_lines.some(
            (line: Record<string, unknown>) =>
              line.reimbursee_employee_id !== body.p_payload.applicant_employee_id
          )
        )
          return route.fulfill({
            status: 400,
            json: { code: '22023', message: '关闭多报销人时，明细报销人必须为申请人' }
          })
        saved.push(body)
        const id = `new-reimbursement-${saved.length}`
        records.push({
          ...body.p_payload,
          id,
          reimbursement_no: `QA-CREATE-${saved.length}`,
          source_type: 'travel',
          status: 'draft',
          total_amount: body.p_lines[0].gross_amount,
          travel_lines: body.p_lines,
          payees: body.p_payees
        })
        return route.fulfill({ json: { id, status: 'draft' } })
      }
      if (name === 'start_workflow') {
        const body = route.request().postDataJSON()
        expect(body.p_business_type).toBe('tms_expense_reimbursement')
        const record = records.find((row) => row.id === body.p_business_id)
        expect(record).toBeDefined()
        if (record) record.status = 'pending_review'
        return route.fulfill({ json: 'isolated-workflow' })
      }
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_reimbursement&employeeId=employee&theme=${theme}&permissions=FinanceExpenseReimbursement:View,FinanceExpenseReimbursement:Add,FinanceExpenseReimbursement:Submit`
    )
    await expect(page.getByRole('heading', { name: '费用报销单', exact: true })).toBeVisible({
      timeout: 60000
    })
    for (const index of [1, 2]) {
      await expect(page.locator('.el-message')).toHaveCount(0)
      await page.getByRole('button', { name: '新增差旅报销', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: '新增费用报销单', exact: true })
      await expect(dialog).toBeVisible()
      await dialog.getByRole('combobox', { name: /费用承担部门$/ }).click()
      await page
        .getByRole('treeitem', { name: '验收公司', exact: true })
        .locator('.el-tree-node__expand-icon')
        .first()
        .click()
      await page.getByText('验收部门', { exact: true }).filter({ visible: true }).click()
      await dialog.getByRole('textbox', { name: /报销事由$/ }).fill(`空白新增报销${index}`)
      if (multiple) {
        const toggle = dialog.getByRole('switch', { name: '多报销人', exact: true })
        await toggle.locator('..').click()
        await expect(toggle).toBeChecked()
      }
      await dialog.getByRole('button', { name: '新增明细', exact: true }).click()
      const line = page.getByRole('dialog', { name: '新增费用明细', exact: true })
      await line.getByRole('combobox', { name: /费用项目$/ }).click()
      await page.getByText('验收报销项目', { exact: true }).filter({ visible: true }).click()
      await line.getByRole('spinbutton', { name: /报销金额（元）$/ }).fill(String(index * 100))
      await line
        .getByRole('textbox', { name: '发票号码', exact: true })
        .fill(`MOCK-INVOICE-${index}`)
      await line.getByRole('button', { name: '添加费用明细', exact: true }).click()
      await expect(line).toBeHidden()
      const expenseRow = dialog.getByRole('row').filter({ hasText: `MOCK-INVOICE-${index}` })
      await expect(expenseRow.getByRole('button', { name: '编辑', exact: true })).toBeVisible()
      await expenseRow.getByRole('button', { name: '编辑', exact: true }).click()
      const editLine = page.getByRole('dialog', { name: '编辑费用明细', exact: true })
      await editLine
        .getByRole('textbox', { name: '发票号码', exact: true })
        .fill(`MOCK-INVOICE-${index}-EDIT`)
      await editLine.getByRole('button', { name: '保存费用明细', exact: true }).click()
      await expenseRow.getByRole('button', { name: '复制', exact: true }).click()
      const copyLine = page.getByRole('dialog', { name: '复制费用明细', exact: true })
      await copyLine
        .getByRole('textbox', { name: '发票号码', exact: true })
        .fill(`MOCK-REMOVE-${index}`)
      await copyLine.getByRole('button', { name: '添加费用明细', exact: true }).click()
      const copiedExpense = dialog.getByRole('row').filter({ hasText: `MOCK-REMOVE-${index}` })
      await copiedExpense.getByRole('button', { name: '删除', exact: true }).click()
      await expect(copiedExpense).toHaveCount(0)
      if (index === 2) {
        await dialog.getByPlaceholder('选择报销人', { exact: true }).click()
        const picker = page.getByRole('dialog', { name: '选择员工', exact: true })
        await picker.getByText('委托员工', { exact: true }).click()
        await picker.getByRole('button', { name: '确定', exact: true }).click()
        await expect(dialog.getByPlaceholder('选择报销人', { exact: true })).toHaveValue(
          '委托员工 · QA002'
        )
      }
      await dialog.getByRole('button', { name: '新增收款', exact: true }).click()
      const payee = page.getByRole('dialog', { name: '添加收款信息', exact: true })
      await payee.getByRole('combobox', { name: /收款人$/ }).click()
      await page.getByRole('option', { name: /隔离收款人/ }).click()
      await expect(payee.getByRole('textbox', { name: /银行账号$/ })).toHaveValue('MOCK-ONLY-1234')
      await expect(payee.getByRole('spinbutton', { name: /收款金额（元）$/ })).toHaveValue(
        `${index * 100}.00`
      )
      await payee.getByRole('button', { name: '添加收款明细', exact: true }).click()
      await expect(payee).toBeHidden()
      const payeeRow = dialog.getByRole('row').filter({ hasText: '隔离收款人' })
      if (index === 2) {
        payeeAvailable = false
        await payeeRow.getByRole('button', { name: '编辑', exact: true }).click()
        const unavailable = page.getByRole('dialog', { name: '编辑收款明细', exact: true })
        await expect(
          unavailable.getByText('当前申请人没有可用的收款信息，请先维护收款银行和账号。', {
            exact: true
          })
        ).toBeVisible()
        await expect(
          unavailable.getByText('隔离收款人（不可用） · 验收银行 · 1234', { exact: true })
        ).toBeVisible()
        await unavailable.getByRole('combobox', { name: /收款人$/ }).click()
        await expect(page.getByRole('option', { name: /隔离收款人（不可用）/ })).toBeDisabled()
        await page.keyboard.press('Escape')
        await unavailable.getByRole('button', { name: '保存收款明细', exact: true }).click()
        await expect(unavailable).toBeVisible()
        await expect(
          page.getByText('原收款资料已失效或不再授权，请重新选择可用收款资料', { exact: true })
        ).toBeVisible()
        await expect(unavailable.getByRole('textbox', { name: /银行账号$/ })).toHaveValue(
          'MOCK-ONLY-1234'
        )
        await unavailable.screenshot({ path: info.outputPath('unavailable-payee.png') })
        await unavailable.getByRole('button', { name: '取消', exact: true }).click()
        payeeAvailable = true
      }
      await payeeRow.getByRole('button', { name: '编辑', exact: true }).click()
      const editPayee = page.getByRole('dialog', { name: '编辑收款明细', exact: true })
      await editPayee
        .getByRole('textbox', { name: '账户名称', exact: true })
        .fill(`验收账户${index}`)
      await editPayee.getByRole('button', { name: '保存收款明细', exact: true }).click()
      await payeeRow.getByRole('button', { name: '复制', exact: true }).click()
      const copyPayee = page.getByRole('dialog', { name: '复制收款明细', exact: true })
      await copyPayee
        .getByRole('textbox', { name: '账户名称', exact: true })
        .fill(`待移除账户${index}`)
      await copyPayee.getByRole('button', { name: '添加收款明细', exact: true }).click()
      const copiedPayee = dialog.getByRole('row').filter({ hasText: `待移除账户${index}` })
      await copiedPayee.getByRole('button', { name: '删除', exact: true }).click()
      await expect(copiedPayee).toHaveCount(0)
      if (index === 2) {
        await expect(page.locator('.el-message')).toHaveCount(0)
        await dialog.screenshot({ path: info.outputPath('reimbursement-created-details.png') })
      }
      await dialog.getByRole('button', { name: '保存草稿', exact: true }).click()
      if (index === 1) {
        await expect(page.getByText('收款资料已更新，请核对后重试', { exact: true })).toBeVisible()
        await expect(dialog.getByRole('textbox', { name: /报销事由$/ })).toHaveValue(
          `空白新增报销${index}`
        )
        await dialog.getByRole('button', { name: '保存草稿', exact: true }).click()
      }
      await expect(dialog).toBeHidden()
      const row = page.getByRole('row').filter({ hasText: `QA-CREATE-${index}` })
      await row.getByRole('button', { name: '提交审批', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: '提交审批', exact: true }).click()
      await expect(row).toContainText('审批中')
      await expect(row.getByRole('button', { name: '提交审批', exact: true })).toHaveCount(0)
    }
    expect(saved).toHaveLength(2)
    for (const [index, body] of saved.entries()) {
      expect(body.p_payload).toMatchObject({
        tenant_id: tenant,
        applicant_employee_id: index === 0 ? 'employee' : 'delegate-employee',
        expense_department_id: 'department',
        reason: `空白新增报销${index + 1}`,
        multiple_reimbursees: multiple
      })
      expect(body.p_payload.id).toBeUndefined()
      expect(body.p_lines).toHaveLength(1)
      expect(body.p_lines[0]).toMatchObject({
        expense_item_id: 'expense',
        reimbursee_employee_id: index === 0 || multiple ? 'employee' : 'delegate-employee',
        gross_amount: (index + 1) * 100
      })
      expect(body.p_payees[0]).toMatchObject({
        payee_information_id: 'payee',
        account_name: `验收账户${index + 1}`,
        amount: (index + 1) * 100
      })
    }
  })
}
