import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)

for (const config of [
  {
    kind: 'repayment',
    label: '还款',
    permission: 'FinanceRepayment',
    table: 'fms_travel_repayment',
    sheet: 'repayment'
  },
  {
    kind: 'travel',
    label: '出差',
    permission: 'FinanceTravelApplication',
    table: 'fms_travel_application',
    sheet: 'application'
  },
  {
    kind: 'loan',
    label: '借款',
    permission: 'FinanceLoanApplication',
    table: 'fms_travel_loan',
    sheet: 'loan'
  },
  {
    kind: 'reimbursement',
    label: '报销',
    permission: 'FinanceExpenseReimbursement',
    table: 'fms_list_expense_reimbursements_secure',
    sheet: 'reimbursement'
  }
])
  for (const interruption of ['离页', '离页并返回', '切换租户', '切换租户并返回']) {
    test(`${config.label}两单打印重读后${interruption}不打印旧结果`, async ({ page }, info) => {
      const records = [1, 2].map((i) => ({
        id: `repayment-${i}`,
        tenant_id: '11111111-1111-4111-8111-111111111111',
        repayment_no: `QA-PRINT-REPAY-${i}`,
        application_no: `QA-PRINT-REPAY-${i}`,
        loan_no: `QA-PRINT-REPAY-${i}`,
        reimbursement_no: `QA-PRINT-REPAY-${i}`,
        source_type: 'travel',
        requested_amount: i * 100,
        loan_amount: i * 100,
        approved_amount: i * 100,
        paid_amount: 0,
        reimbursed_amount: 0,
        offset_amount: 0,
        itineraries: [],
        payees: [],
        payments: [],
        status: 'draft',
        amount: i * 100,
        received_amount: 0,
        applicant_name: '隔离还款员工',
        repayment_date: '2026-10-25',
        reason: '打印隔离验收',
        attachment_urls: [],
        items: [],
        receipts: []
      }))
      let hold = false
      let started = 0
      let finished = 0
      let release = () => {}
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      await page.route('**/rest/v1/**', async (route) => {
        const url = new URL(route.request().url())
        const name = url.pathname.split('/').at(-1)
        if (name === 'sys_tenant')
          return route.fulfill({
            json: [1, 2].map((i) => ({
              id:
                i === 1
                  ? '11111111-1111-4111-8111-111111111111'
                  : '22222222-2222-4222-8222-222222222222',
              tenant_code: `qa-${i}`,
              tenant_name: `隔离租户${i}`,
              status: '1'
            })),
            headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
          })
        if (name === config.table || name === 'tms_get_expense_reimbursement_secure') {
          const id =
            name === 'tms_get_expense_reimbursement_secure'
              ? route.request().postDataJSON().p_id
              : url.searchParams.get('id')?.replace(/^eq\./, '')
          if (id) {
            started++
            if (hold) await gate
            await route.fulfill({ json: records.find((row) => row.id === id) })
            finished++
            return
          }
          return route.fulfill({
            json: config.kind === 'reimbursement' ? { records, total: records.length } : records,
            headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
          })
        }
        return route.fulfill({ json: [] })
      })
      const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
      await page.goto(
        `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_${config.kind}&arNavigation=1&theme=${theme}&permissions=${config.permission}:View,${config.permission}:Print${interruption.startsWith('切换') ? '&scopeControls=1&platformSuper=1' : ''}`
      )
      await expect(page.getByText('QA-PRINT-REPAY-1', { exact: true })).toBeVisible({
        timeout: 60000
      })
      await page.evaluate((sheet) => {
        document.body.dataset.repaymentPrintCount = '0'
        window.print = () => {
          document.body.dataset.repaymentPrintCount = String(
            Number(document.body.dataset.repaymentPrintCount) + 1
          )
          document.body.dataset.repaymentPrintText =
            document.querySelector(`.fms-${sheet}-print-batch`)?.textContent || ''
        }
      }, config.sheet)
      await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
      const print = page.getByRole('button', { name: '批量打印', exact: true })
      await print.click()
      await expect(page.locator('body')).toHaveAttribute('data-repayment-print-count', '1')
      await expect(page.locator('body')).toHaveAttribute(
        'data-repayment-print-text',
        /QA-PRINT-REPAY-1.*QA-PRINT-REPAY-2/s
      )
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
      hold = true
      const before = started
      await print.click()
      await expect.poll(() => started).toBe(before + 2)
      if (interruption.startsWith('切换')) {
        await page.getByRole('button', { name: '切换租户2', exact: true }).click()
        await expect(page.getByTestId('scope-value')).toHaveText(
          '22222222-2222-4222-8222-222222222222'
        )
        if (interruption.endsWith('返回')) {
          await page.getByRole('button', { name: '切换租户1', exact: true }).click()
          await expect(page.getByTestId('scope-value')).toHaveText(
            '11111111-1111-4111-8111-111111111111'
          )
        }
      } else {
        await page.getByRole('button', { name: '打开其他页面', exact: true }).click()
        await expect(page.getByRole('heading', { name: '其他业务页面', exact: true })).toBeVisible()
        if (interruption.endsWith('返回'))
          await page.getByRole('button', { name: '返回来源页面', exact: true }).click()
      }
      release()
      await expect.poll(() => finished).toBe(started)
      await page.waitForLoadState('networkidle')
      await expect(page.locator('body')).toHaveAttribute('data-repayment-print-count', '1')
      await expect(page.locator('body')).not.toHaveClass(/is-fms-.*-printing/)
    })
  }
