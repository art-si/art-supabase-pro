import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90000)

for (const config of [
  {
    kind: 'travel',
    sheet: 'application',
    resource: 'fms_travel_application',
    number: 'application_no'
  },
  { kind: 'loan', sheet: 'loan', resource: 'fms_travel_loan', number: 'loan_no' },
  {
    kind: 'repayment',
    sheet: 'repayment',
    resource: 'fms_travel_repayment',
    number: 'repayment_no'
  },
  {
    kind: 'reimbursement',
    sheet: 'reimbursement',
    resource: 'fms_list_expense_reimbursements_secure',
    number: 'reimbursement_no'
  }
]) {
  test(`${config.kind} 两张单据打印详情、失败恢复与打印后清理`, async ({ page }, info) => {
    let fail = true
    const details: string[] = []
    const records = [1, 2].map((index) => ({
      id: `print-record-${index}`,
      tenant_id: '11111111-1111-4111-8111-111111111111',
      [config.number]: `QA-PRINT-${index}`,
      status: 'draft',
      source_type: 'travel',
      is_demo: true,
      applicant_name: `验收员工${index}`,
      applicant_name_snapshot: `验收员工${index}`,
      application_date: '2026-10-23',
      estimated_days: 2,
      repayment_date: '2026-10-23',
      reimbursement_date: '2026-10-23',
      expense_department_name: '验收部门',
      expense_department_name_snapshot: '验收部门',
      reason: `打印验收事由${index}`,
      requested_amount: index * 100,
      loan_amount: index * 100,
      amount: index * 100,
      total_amount: index * 100,
      approved_amount: index * 100,
      cash_payable_amount: index * 100,
      loan_offset_amount: 0,
      payer_name: `验收员工${index}`,
      payer_bank: '验收银行',
      bank_account: `622200000000000${index}`,
      attachment_urls: [],
      loan: config.kind === 'repayment' ? { loan_no: `JK-PRINT-${index}` } : undefined,
      itineraries: [
        {
          id: `itinerary-${index}`,
          line_no: 1,
          departure_place: '验收出发地',
          destination_place: `验收目的地${index}`,
          start_date: '2026-10-23',
          end_date: '2026-10-24',
          requested_amount: index * 100
        }
      ],
      items: [
        {
          id: `item-${index}`,
          purpose: `验收明细${index}`,
          loan_purpose: `验收明细${index}`,
          expense_item_name: `验收项目${index}`,
          expenseItem: { item_name: `验收项目${index}` },
          amount: index * 100,
          currency_code: 'CNY',
          exchange_rate: 1
        }
      ],
      travel_lines: [
        {
          id: `line-${index}`,
          expense_item_name_snapshot: `验收项目${index}`,
          project_name_snapshot: `验收明细${index}`,
          occurred_on: '2026-10-23',
          gross_amount: index * 100,
          tax_amount: 0,
          approved_amount: index * 100
        }
      ],
      payees: [
        {
          id: `payee-${index}`,
          payee_name: `验收收款人${index}`,
          payee_name_snapshot: `验收收款人${index}`,
          bank_name: '验收银行',
          bank_name_snapshot: '验收银行',
          bank_account: `622200000000000${index}`,
          bank_account_snapshot: `622200000000000${index}`,
          amount: index * 100
        }
      ]
    }))
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const resource = url.pathname.split('/').at(-1)
      const detailId =
        resource === 'tms_get_expense_reimbursement_secure'
          ? route.request().postDataJSON().p_id
          : url.searchParams.get('id')?.replace(/^eq\./, '')
      if (
        detailId &&
        (resource === config.resource || resource === 'tms_get_expense_reimbursement_secure')
      ) {
        details.push(detailId)
        if (fail)
          return route.fulfill({
            status: 503,
            json: { code: 'XX000', message: 'database unavailable' }
          })
        return route.fulfill({ json: records.find((record) => record.id === detailId) })
      }
      if (resource !== config.resource) return route.fulfill({ json: [] })
      return route.fulfill({
        json: config.kind === 'reimbursement' ? { records, total: 2 } : records,
        headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
      })
    })
    await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=expense_${config.kind}`)
    await expect(page.getByText('QA-PRINT-2', { exact: true })).toBeVisible()
    await page.evaluate(() => {
      window.print = () => {
        document.body.dataset.printed = 'true'
      }
    })
    await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
    await page.getByRole('button', { name: '批量打印', exact: true }).click()
    await expect(page.locator('.el-message--error')).toHaveCount(1)
    await expect(page.locator('.el-message--error')).not.toContainText('database unavailable')
    await expect(page.locator('body')).not.toHaveAttribute('data-printed', 'true')
    fail = false
    await page.getByRole('button', { name: '批量打印', exact: true }).click()
    await expect(page.locator('body')).toHaveAttribute('data-printed', 'true')
    expect(details.filter((id) => id === 'print-record-1').length).toBeGreaterThanOrEqual(2)
    expect(details.filter((id) => id === 'print-record-2').length).toBeGreaterThanOrEqual(2)
    await page.emulateMedia({ media: 'print' })
    const sheets = page.locator(`.fms-${config.sheet}-print-sheet`)
    await expect(sheets).toHaveCount(2)
    for (const index of [1, 2]) {
      const sheet = sheets.nth(index - 1)
      await expect(sheet).toContainText(`QA-PRINT-${index}`)
      await expect(sheet).toContainText(`验收员工${index}`)
      await expect(sheet).toContainText(`打印验收事由${index}`)
      await expect(sheet).toContainText(
        config.kind === 'travel' ? `验收目的地${index}` : `验收明细${index}`
      )
      await expect(sheet).not.toContainText(`QA-PRINT-${index === 1 ? 2 : 1}`)
      if (config.kind === 'loan' || config.kind === 'reimbursement') {
        await expect(sheet).toContainText(`验收收款人${index}`)
        await expect(sheet).toContainText(`622200000000000${index}`)
      }
    }
    await page.screenshot({ path: info.outputPath(`${config.kind}-print.png`), fullPage: true })
    await page.pdf({
      path: info.outputPath(`${config.kind}-print.pdf`),
      format: 'A4',
      printBackground: true
    })
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
    await page.emulateMedia({ media: 'screen' })
    await expect(sheets).toHaveCount(0)
    await expect(page.getByText('QA-PRINT-2', { exact: true })).toBeVisible()
  })
}
