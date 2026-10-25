import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(150000)
test('费用委托两条新增编辑撤销与失败重试', async ({ page }, info) => {
  const tenant = '11111111-1111-4111-8111-111111111111'
  const records: Array<Record<string, unknown>> = []
  const saves: Array<Record<string, unknown>> = []
  let fail = true
  let failRead = true
  let failRevoke = true
  let reads = 0
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1)
    const body = request.postData() ? request.postDataJSON() : {}
    if (name === 'sys_dictionary') {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      const options =
        code === 'fmsExpenseDelegationScope'
          ? [
              ['travel_application', '出差申请'],
              ['travel_loan', '借款单'],
              ['expense_reimbursement', '费用报销']
            ]
          : code === 'commonBoolean'
            ? [
                ['true', '是'],
                ['false', '否']
              ]
            : []
      return route.fulfill({
        json: options.map(([value, label]) => ({
          id: `${code}-${value}`,
          code: value,
          value,
          label,
          status: '1',
          dict_type_table: { code }
        }))
      })
    }
    if (name === 'sys_user')
      return route.fulfill({
        json: [1, 2].map((i) => ({
          id: `delegate-${i}`,
          tenant_id: tenant,
          user_name: `delegate${i}`,
          nick_name: `验收同事${i}`,
          status: '1',
          organization: null
        }))
      })
    if (name === 'fms_expense_delegation') {
      reads++
      if (failRead) {
        failRead = false
        return route.fulfill({
          status: 409,
          json: { code: 'P0001', message: '委托记录加载失败，请重试' }
        })
      }
      expect(url.searchParams.get('tenant_id')).toBe(`eq.${tenant}`)
      expect(url.searchParams.get('principal_employee_id')).toBe('eq.employee-self')
      return route.fulfill({ json: records })
    }
    if (name === 'save_fms_expense_delegation_secure') {
      saves.push(body)
      if (fail) {
        fail = false
        return route.fulfill({
          status: 409,
          json: { code: 'P0001', message: '费用委托暂未保存，请重试' }
        })
      }
      const id = body.p_id || `delegation-${records.length + 1}`
      const existing = records.find((row) => row.id === id)
      const row = {
        id,
        tenant_id: tenant,
        principal_employee_id: 'employee-self',
        delegate_user_id: body.p_delegate_user_id,
        scopes: body.p_scopes,
        valid_from: body.p_valid_from,
        valid_to: body.p_valid_to,
        is_active: true,
        delegate: {
          user_name: body.p_delegate_user_id,
          nick_name: body.p_delegate_user_id === 'delegate-1' ? '验收同事1' : '验收同事2'
        }
      }
      if (existing) Object.assign(existing, row)
      else records.push(row)
      return route.fulfill({ json: id })
    }
    if (name === 'revoke_fms_expense_delegation_secure') {
      if (failRevoke) {
        failRevoke = false
        return route.fulfill({
          status: 409,
          json: { code: 'P0001', message: '委托撤销失败，请重试' }
        })
      }
      const row = records.find((item) => item.id === body.p_id)
      expect(row).toBeDefined()
      if (row) row.is_active = false
      return route.fulfill({ json: null })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_reimbursement&employeeId=employee-self&theme=${theme}&permissions=FinanceExpenseReimbursement:View,FinanceExpenseReimbursement:Delegate`
  )
  const open = page.getByRole('button', { name: '费用委托', exact: true })
  await expect(open).toBeVisible({ timeout: 60000 })
  await open.click()
  const manager = page.getByRole('dialog', { name: '费用委托管理', exact: true })
  await expect(
    manager.getByText('费用委托未加载，请核对账号员工档案后重试', { exact: true })
  ).toBeVisible()
  await manager.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(manager.getByText('暂无本人发出的费用委托', { exact: true })).toBeVisible()
  for (const i of [1, 2]) {
    await manager.getByRole('button', { name: '新增委托', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '新增费用委托', exact: true })
    await editor.getByRole('combobox', { name: /受托账号/ }).click()
    await page.getByRole('option', { name: new RegExp(`验收同事${i}`) }).click()
    await editor.getByRole('checkbox', { name: '费用报销', exact: true }).locator('..').click()
    await editor.getByRole('button', { name: '保存委托', exact: true }).click()
    if (i === 1) {
      await expect(editor).toBeVisible()
      await expect(page.getByText('费用委托暂未保存，请重试', { exact: true })).toBeVisible()
      await expect(editor.getByRole('checkbox', { name: '费用报销', exact: true })).toBeChecked()
      await editor.getByRole('button', { name: '保存委托', exact: true }).click()
    }
    await expect(editor).toBeHidden()
    const row = manager.getByRole('row').filter({ hasText: `验收同事${i}` })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    const edit = page.getByRole('dialog', { name: '编辑费用委托', exact: true })
    await expect(edit.getByRole('combobox', { name: /受托账号/ })).toBeDisabled()
    await edit.getByRole('checkbox', { name: '借款单', exact: true }).locator('..').click()
    await edit.screenshot({ path: info.outputPath(`delegation-edit-${i}.png`) })
    await edit.getByRole('button', { name: '保存委托', exact: true }).click()
    await expect(edit).toBeHidden()
    await expect(row).toContainText('借款单')
    await row.getByRole('button', { name: '撤销委托', exact: true }).click()
    await page
      .getByRole('dialog', { name: '撤销费用委托', exact: true })
      .getByRole('button', { name: '确定', exact: true })
      .click()
    if (i === 1) {
      await expect(page.getByText('委托撤销失败，请重试', { exact: true })).toBeVisible()
      await expect(row.getByRole('button', { name: '撤销委托', exact: true })).toBeEnabled()
      await row.getByRole('button', { name: '撤销委托', exact: true }).click()
      await page
        .getByRole('dialog', { name: '撤销费用委托', exact: true })
        .getByRole('button', { name: '确定', exact: true })
        .click()
    }
    await expect(row.getByRole('button', { name: '撤销委托', exact: true })).toBeDisabled()
  }
  expect(records).toHaveLength(2)
  expect(saves).toHaveLength(5)
  await expect(page.locator('.el-message')).toHaveCount(0)
  await manager.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((node) => {
    node.scrollLeft = 0
  })
  await manager.screenshot({ path: info.outputPath('delegation-records-left.png') })
  await manager.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((node) => {
    node.scrollLeft = node.scrollWidth
  })
  await manager.screenshot({ path: info.outputPath('delegation-records-right.png') })
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_reimbursement&theme=${theme}&permissions=FinanceExpenseReimbursement:View`
  )
  await expect(page.getByRole('heading', { name: '费用报销单', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '费用委托', exact: true })).toHaveCount(0)
  const before = reads
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_reimbursement&theme=${theme}&permissions=FinanceExpenseReimbursement:View,FinanceExpenseReimbursement:Delegate`
  )
  await page.getByRole('button', { name: '费用委托', exact: true }).click()
  await expect(
    page.getByText('请先为当前账号绑定员工档案后管理委托', { exact: true })
  ).toBeVisible()
  expect(reads).toBe(before)
})
