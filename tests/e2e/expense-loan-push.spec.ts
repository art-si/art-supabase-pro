import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90000)

test('普通用户两张借款下推还款按最新可用余额分配，保存失败可重试', async ({ page }, info) => {
  const tenant = '11111111-1111-4111-8111-111111111111'
  const loans = [1, 2].map((index) => ({
    id: `push-loan-${index}`,
    tenant_id: tenant,
    loan_no: `QA-PUSH-${index}`,
    status: 'paid',
    applicant_name: '下推验收员工',
    reason: `下推归还事由${index}`,
    paid_amount: 200,
    remaining_balance: 200,
    available_amount: index * 40,
    attachment_urls: [],
    items: [
      { id: `item-${index}-1`, amount: 50, expense_item: { item_name: '交通费' } },
      { id: `item-${index}-2`, amount: 150, expense_item: { item_name: '住宿费' } }
    ]
  }))
  const prepared: string[] = []
  const saved: Array<{ p_payload: { loan_id: string }; p_items: Array<{ amount: number }> }> = []
  let failSave = true
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    if (name === 'fms_travel_loan') return route.fulfill({ json: loans })
    if (name === 'prepare_fms_travel_loan_push_secure') {
      const body = route.request().postDataJSON()
      expect(body.p_kind).toBe('repayment')
      prepared.push(body.p_loan_id)
      return route.fulfill({ json: loans.find((loan) => loan.id === body.p_loan_id) })
    }
    if (name === 'fms_list_repayable_loans_secure') return route.fulfill({ json: loans })
    if (name === 'save_fms_travel_repayment_draft_entry_secure') {
      if (failSave) {
        failSave = false
        return route.fulfill({
          status: 409,
          json: { code: 'P0001', message: '借款余额已更新，请核对后重试' }
        })
      }
      saved.push(route.request().postDataJSON())
      return route.fulfill({ json: { id: `draft-${saved.length}`, status: 'draft' } })
    }
    return route.fulfill({ json: [] })
  })
  const permissions = [
    'FinanceLoanApplication:View',
    'FinanceLoanApplication:PushRepayment',
    'FinanceRepayment:View',
    'FinanceRepayment:Add'
  ].join(',')
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  for (const [index, loan] of loans.entries()) {
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_loan&loanPush=1&theme=${theme}&permissions=${permissions}`
    )
    await page
      .getByRole('row')
      .filter({ hasText: loan.loan_no })
      .locator('label.el-checkbox')
      .click()
    await page.getByRole('button', { name: '下推', exact: true }).click()
    await page.getByText('还款单', { exact: true }).last().click()
    const dialog = page.getByRole('dialog', { name: '新增还款单', exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: /还款事由/ })).toHaveValue(loan.reason)
    if (index === 1)
      await dialog.screenshot({ path: info.outputPath('loan-push-repayment-dialog.png') })
    await dialog.getByRole('button', { name: '保存草稿', exact: true }).click()
    if (index === 0) {
      await expect(page.getByText('借款余额已更新，请核对后重试', { exact: true })).toBeVisible()
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: '保存草稿', exact: true }).click()
    }
    await expect(dialog).toBeHidden()
    expect(saved[index].p_payload.loan_id).toBe(loan.id)
    expect(saved[index].p_items.reduce((sum, item) => sum + item.amount, 0)).toBe(
      loan.available_amount
    )
  }
  expect(prepared).toEqual(loans.map((loan) => loan.id))
  await page.screenshot({ path: info.outputPath('loan-push-repayment.png'), fullPage: true })
})

test('两张借款下推报销表单保持打开并保留来源事由', async ({ page }, info) => {
  const tenant = '11111111-1111-4111-8111-111111111111'
  const loans = [1, 2].map((index) => ({
    id: `reimburse-source-${index}`,
    tenant_id: tenant,
    loan_no: `QA-REIMBURSE-PUSH-${index}`,
    status: 'paid',
    reason: `借款报销来源事由${index}`,
    paid_amount: 100,
    remaining_balance: 100,
    available_amount: 100,
    attachment_urls: [],
    items: [{ id: `expense-${index}`, amount: 100, expense_item_id: 'travel' }],
    payees: []
  }))
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'fms_travel_loan') return route.fulfill({ json: loans })
    if (name === 'prepare_fms_travel_loan_push_secure') {
      const input = route.request().postDataJSON()
      expect(input.p_kind).toBe('reimbursement')
      return route.fulfill({ json: loans.find((loan) => loan.id === input.p_loan_id) })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  for (const loan of loans) {
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_loan&loanPush=1&theme=${theme}`
    )
    await page
      .getByRole('row')
      .filter({ hasText: loan.loan_no })
      .locator('label.el-checkbox')
      .click()
    await page.getByRole('button', { name: '下推', exact: true }).click()
    await page.getByText('差旅报销单', { exact: true }).last().click()
    const dialog = page.getByRole('dialog', { name: `借款下推报销 · ${loan.loan_no}`, exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: /报销事由/ })).toHaveValue(loan.reason)
    await dialog.screenshot({ path: info.outputPath(`${loan.id}-dialog.png`) })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toBeHidden()
  }
})
