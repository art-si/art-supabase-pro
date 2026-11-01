import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
const tenantId = '11111111-1111-4111-8111-111111111111',
  recordId = '44444444-4444-4444-8444-444444444444',
  employeeId = '33333333-3333-4333-8333-333333333333',
  companyId = '55555555-5555-4555-8555-555555555555',
  expenseId = '66666666-6666-4666-8666-666666666666',
  loanId = '77777777-7777-4777-8777-777777777777',
  lineId = '88888888-8888-4888-8888-888888888888'
const common = {
  id: recordId,
  tenantId,
  status: 'draft',
  applicantEmployeeId: employeeId,
  applicantName: '验收申请人',
  applicantEmployeeNo: 'EMP-001',
  applicantOrganizationId: companyId,
  expenseDepartmentId: companyId,
  assignmentId: lineId,
  applicationDate: '2026-11-01',
  reason: '',
  remark: '原补充说明',
  attachmentUrls: [],
  multipleTravelers: false,
  sourceType: 'travel',
  totalAmount: 100,
  plannedPaymentDate: '2026-12-01'
}
const company = {
  id: companyId,
  tenantId,
  parentId: null,
  organizationCode: 'COMPANY',
  organizationName: '验收费用公司',
  organizationType: 'company',
  status: '1',
  children: []
}
const payee = {
  id: lineId,
  settlementMethod: 'bank_transfer',
  payeeType: 'person',
  payeeInformationId: lineId,
  payeeName: '验收收款人',
  bankAccount: '622200000001',
  accountName: '验收收款人',
  bankName: '验收银行',
  amount: 100,
  payeeNameSnapshot: '验收收款人',
  bankAccountSnapshot: '622200000001',
  accountNameSnapshot: '验收收款人',
  bankNameSnapshot: '验收银行'
}
const loan = {
  ...common,
  id: loanId,
  loanNo: 'LOAN-001',
  reason: '原借款用途',
  repaymentDate: '2026-12-01',
  loanAmount: 100,
  paidAmount: 100,
  remainingBalance: 100,
  availableAmount: 100,
  status: 'paid',
  items: [
    {
      id: lineId,
      expenseItemId: expenseId,
      amount: 100,
      purpose: '交通费',
      borrowerEmployeeId: employeeId
    }
  ],
  payees: [payee],
  payments: []
}
const scenarios = [
  {
    name: '出差申请',
    feature: 'application',
    file: 'travel-application/modules/travel-application-dialog.vue',
    permission: 'FinanceTravelApplication',
    label: '事由',
    tabs: 2,
    rpc: 'save_fms_travel_application_draft_secure',
    row: {
      ...common,
      applicationNo: 'TRAVEL-001',
      travelType: 'general',
      itineraries: [
        {
          id: lineId,
          expenseItemId: expenseId,
          startDate: '2026-11-01',
          endDate: '2026-11-02',
          departure: '上海',
          destination: '北京',
          requestedAmount: 100,
          travelerEmployeeId: employeeId,
          travelerName: '验收申请人'
        }
      ]
    }
  },
  {
    name: '借款申请',
    feature: 'loan',
    file: 'loan-application/modules/travel-loan-dialog.vue',
    permission: 'FinanceLoanApplication',
    label: '借款事由',
    tabs: 3,
    rpc: 'save_fms_travel_loan_draft_secure',
    row: { ...loan, id: recordId, status: 'draft', reason: '' }
  },
  {
    name: '差旅报销',
    feature: 'reimbursement',
    file: 'expense-reimbursement/modules/travel-reimbursement-dialog.vue',
    permission: 'FinanceExpenseReimbursement',
    label: '报销事由',
    tabs: 3,
    rpc: 'fms_save_travel_reimbursement_draft_secure',
    row: {
      ...common,
      reimbursementNo: 'EXPENSE-001',
      reimbursementDate: '2026-11-01',
      multipleReimbursees: false,
      isProjectExpense: false,
      loanOffsetAmount: 0,
      basisUrls: [],
      travelLines: [
        {
          id: lineId,
          expenseItemId: expenseId,
          occurredOn: '2026-11-01',
          grossAmount: 100,
          taxRate: 0,
          taxAmount: 0,
          reimburseeEmployeeId: employeeId,
          invoiceNo: 'INV-001'
        }
      ],
      payees: [payee]
    }
  },
  {
    name: '归还借款',
    feature: 'repayment',
    file: 'repayment/modules/repayment-dialog.vue',
    permission: 'FinanceRepayment',
    label: '还款事由',
    tabs: 2,
    rpc: 'save_fms_travel_repayment_draft_entry_secure',
    row: {
      ...common,
      loanId,
      repaymentNo: 'REPAY-001',
      repaymentDate: '2026-11-01',
      items: [{ id: lineId, loanItemId: lineId, amount: 100, remark: null }],
      receipts: []
    }
  }
]
for (const scenario of scenarios) {
  for (const readonly of ['application', 'repayment'].includes(scenario.feature)
    ? [false, true]
    : [false])
    test(`${scenario.name}${readonly ? '只读详情' : '编辑'}分类保留来源数据`, async ({
      page
    }, testInfo) => {
      await prepareIsolatedSession(page)
      const submissions: Record<string, unknown>[] = [],
        errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/**', (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          rpc = url.pathname.split('/rpc/')[1]
        if (rpc === scenario.rpc) {
          submissions.push(request.postDataJSON())
          return route.fulfill({ json: { id: recordId, status: 'draft' } })
        }
        if (
          url.pathname.endsWith('/fms_travel_application') ||
          url.pathname.endsWith('/fms_travel_repayment') ||
          rpc === 'tms_get_expense_reimbursement_secure'
        )
          return route.fulfill({ json: scenario.row })
        if (url.pathname.endsWith('/fms_travel_loan'))
          return route.fulfill({ json: scenario.feature === 'loan' ? scenario.row : loan })
        if (rpc === 'fms_list_repayable_loans_secure' || rpc?.includes('offsettable_loan'))
          return route.fulfill({ json: [loan] })
        if (url.pathname.includes('organization') || rpc?.includes('organization'))
          return route.fulfill({ json: [company] })
        if (url.pathname.endsWith('/mdm_employee_assignment'))
          return route.fulfill({
            json: [
              {
                id: lineId,
                tenantId,
                employeeId,
                businessTitle: '验收岗位',
                primaryAssignment: true
              }
            ]
          })
        if (url.pathname.endsWith('/mdm_employee'))
          return route.fulfill({
            json: [
              {
                id: employeeId,
                tenantId,
                employeeName: '验收申请人',
                employeeNo: 'EMP-001',
                organizationId: companyId,
                employmentStatus: 'active'
              }
            ]
          })
        if (url.pathname.includes('expense_item'))
          return route.fulfill({
            json: [
              {
                id: expenseId,
                tenantId,
                parentId: null,
                itemCode: 'TRAVEL',
                itemName: '差旅费用',
                isEnabled: true,
                children: []
              }
            ]
          })
        return route.fulfill({ json: [] })
      })
      await page.addInitScript(
        (input) => {
          window.formsMigrationInput = input
        },
        {
          args: [{ row: scenario.row, readonly }],
          permissions: [scenario.permission + ':View', scenario.permission + ':Edit']
        }
      )
      await page.goto(
        '/tests/e2e/fixtures/forms-migration-business.html?entry=' +
          encodeURIComponent('modules/art-supabase-fms/src/views/everyone-expense/' + scenario.file)
      )
      const dialog = page.locator('.el-dialog:visible').first(),
        tabs = dialog.getByRole('tab')
      await expect(dialog).toBeVisible({ timeout: 60_000 })
      await expect(page.getByTestId('open-error')).toBeEmpty()
      await expect(tabs).toHaveCount(scenario.tabs)
      for (let index = 0; index < scenario.tabs; index++) {
        await tabs.nth(index).click()
        await expect(tabs.nth(index)).toHaveAttribute('aria-selected', 'true')
      }
      if (readonly) {
        await expect(dialog.locator('.el-dialog__footer button')).toHaveCount(0)
        expect(submissions).toHaveLength(0)
      } else {
        const field = page.getByRole('textbox', {
            name: new RegExp('^\\*?\\s*' + scenario.label + '$')
          }),
          confirm = dialog.locator('.el-dialog__footer button').last()
        await tabs.first().click()
        await expect(field).toBeVisible()
        await field.evaluate((node) => node.setAttribute('data-travel-field', 'preserved'))
        await tabs.last().click()
        await expect(field).toBeHidden()
        await expect(page.locator('[data-travel-field]')).toHaveCount(1)
        await confirm.click()
        await expect(field).toBeVisible()
        await expect(field).toBeFocused()
        expect(submissions).toHaveLength(0)
        await field.fill('分类改造保存验收-' + scenario.name)
        await field.press('Tab')
        await page.screenshot({
          path: testInfo.outputPath('edit-corrected.png'),
          animations: 'disabled'
        })
        await confirm.click()
        await expect.poll(() => submissions.length).toBe(1)
        await expect(page.getByTestId('successes')).toHaveText('1')
        expect(submissions[0].p_payload).toMatchObject({
          id: recordId,
          tenant_id: tenantId,
          reason: '分类改造保存验收-' + scenario.name
        })
        if (scenario.feature === 'loan')
          expect(submissions[0]).toMatchObject({
            p_items: [{ expense_item_id: expenseId, amount: 100 }],
            p_payees: [{ payee_name: '验收收款人', amount: 100 }]
          })
        else if (scenario.feature === 'repayment')
          expect(submissions[0].p_items).toMatchObject([{ loan_item_id: lineId, amount: 100 }])
        else if (scenario.feature === 'reimbursement')
          expect(submissions[0]).toMatchObject({
            p_lines: [{ expense_item_id: expenseId, gross_amount: 100, tax_amount: 0 }],
            p_payees: [{ bank_account: '622200000001', amount: 100 }]
          })
        else
          expect(submissions[0].p_lines).toMatchObject([
            { expense_item_id: expenseId, requested_amount: 100 }
          ])
      }
      if (readonly)
        await page.screenshot({
          path: testInfo.outputPath('readonly-tab.png'),
          animations: 'disabled'
        })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
        )
      ).toBe(true)
      expect(errors).toEqual([])
    })
}
