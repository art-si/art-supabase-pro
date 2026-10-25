import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })

for (const kind of ['loan', 'reimbursement'] as const) {
  test(`${kind}两张单据没有可用付款账户时提示维护且不登记付款`, async ({ page }) => {
    const records = [1, 2].map((index) => ({
      id: `empty-${index}`,
      tenant_id: '11111111-1111-4111-8111-111111111111',
      loan_no: `QA-EMPTY-${index}`,
      reimbursement_no: `QA-EMPTY-${index}`,
      status: 'approved',
      is_demo: true,
      source_type: 'travel',
      approved_amount: 100,
      paid_amount: 0,
      remaining_amount: 100,
      attachment_urls: [],
      payments: [],
      payees: [
        { id: `payee-${index}`, payee_name: '隔离收款人', amount: 100, remaining_amount: 100 }
      ]
    }))
    let writes = 0
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.split('/').at(-1)
      if (name === 'fms_travel_loan')
        return route.fulfill({
          json: url.searchParams.has('id')
            ? records.find((record) => `eq.${record.id}` === url.searchParams.get('id'))
            : records
        })
      if (name === 'fms_list_expense_reimbursements_secure')
        return route.fulfill({ json: { records, total: 2 } })
      if (name === 'tms_get_expense_reimbursement_secure')
        return route.fulfill({
          json: records.find((record) => record.id === route.request().postDataJSON().p_id)
        })
      if (name?.startsWith('record_fms_travel_')) writes++
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=expense_${kind}`)
    for (const record of records) {
      await expect(page.locator('.el-message')).toHaveCount(0)
      await page
        .getByRole('row')
        .filter({ hasText: record.loan_no })
        .getByRole('button', { name: '模拟付款', exact: true })
        .click()
      if (kind === 'loan') {
        const dialog = page.getByRole('dialog', { name: '模拟借款付款', exact: true })
        await expect(
          dialog.getByText('请先维护可用的界面验收资金账户。', { exact: true })
        ).toBeVisible()
        await dialog.getByRole('button', { name: '记录模拟付款', exact: true }).click()
        await expect(dialog.locator('.el-form-item__error')).toContainText('请选择付款资金账户')
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
      } else {
        await expect(page.getByText('请先维护界面验收资金账户', { exact: true })).toBeVisible()
        await expect(page.getByRole('dialog')).toHaveCount(0)
      }
    }
    expect(writes).toBe(0)
  })
}
