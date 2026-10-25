import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)

for (const config of [
  { kind: 'travel', table: 'fms_travel_application', title: '提交出差审批' },
  { kind: 'loan', table: 'fms_travel_loan', title: '提交借款审批' },
  { kind: 'repayment', table: 'fms_travel_repayment', title: '提交还款审批' },
  { kind: 'reimbursement', table: 'fms_list_expense_reimbursements_secure', title: '提交报销审批' }
])
  for (const mode of ['tenant', 'permission']) {
    test(`${config.kind}提交确认锁定按钮且${mode === 'tenant' ? '租户变化' : '撤销权限'}阻止旧提交`, async ({
      page
    }, info) => {
      const records = [1, 2].map((i) => ({
        id: `submit-${i}`,
        tenant_id: '11111111-1111-4111-8111-111111111111',
        loan_no: `QA-SUBMIT-${i}`,
        application_no: `QA-SUBMIT-${i}`,
        requested_amount: 100,
        repayment_no: `QA-SUBMIT-${i}`,
        reimbursement_no: `QA-SUBMIT-${i}`,
        source_type: 'travel',
        status: config.kind === 'travel' && i === 2 ? 'rejected' : 'draft',
        amount: 100,
        loan_amount: 100,
        approved_amount: 100,
        paid_amount: 0,
        received_amount: 0,
        remaining_amount: 100,
        applicant_name: '隔离提交员工',
        attachment_urls: []
      }))
      const calls: string[] = []
      let fail = true
      await page.route('**/rest/v1/**', async (route) => {
        const request = route.request()
        const name = new URL(request.url()).pathname.split('/').at(-1)
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
        if (name === config.table)
          return route.fulfill({
            json: config.kind === 'reimbursement' ? { records, total: records.length } : records,
            headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
          })
        if (name === 'start_workflow' || name === 'submit_fms_travel_repayment_secure') {
          const body = request.postDataJSON()
          const id = body.p_business_id || body.p_id
          if (config.kind === 'travel') expect(body.p_business_type).toBe('fms_travel_application')
          calls.push(id)
          if (fail) {
            fail = false
            return route.fulfill({
              status: 409,
              json: { code: 'P0001', message: '审批提交失败，请重试' }
            })
          }
          const row = records.find((item) => item.id === id)
          if (row) row.status = config.kind === 'travel' ? 'pending_review' : 'submitted'
          return route.fulfill({
            json: name === 'start_workflow' ? 'workflow-qa' : { id, status: 'submitted' }
          })
        }
        return route.fulfill({ json: [] })
      })
      const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
      const permission =
        config.kind === 'travel'
          ? 'FinanceTravelApplication'
          : config.kind === 'loan'
            ? 'FinanceLoanApplication'
            : config.kind === 'repayment'
              ? 'FinanceRepayment'
              : 'FinanceExpenseReimbursement'
      await page.goto(
        `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_${config.kind}&arNavigation=1&theme=${theme}&${mode === 'tenant' ? 'scopeControls=1' : `permissionControls=1&permissions=${permission}:View,${permission}:Submit`}`
      )
      const row = (i: number) => page.getByRole('row').filter({ hasText: `QA-SUBMIT-${i}` })
      const submit = (i: number) => row(i).getByRole('button', { name: /^(提交审批|处理中)$/ })
      await expect(submit(1)).toBeVisible({ timeout: 60000 })
      await submit(1).click()
      const confirm = page.getByRole('dialog', { name: config.title, exact: true })
      await expect(confirm).toBeVisible()
      await expect(submit(1)).toBeDisabled()
      await expect(submit(2)).toBeDisabled()
      await confirm.screenshot({ path: info.outputPath('submit-confirmation.png') })
      // Simulate an external context update while the modal is pending.
      if (mode === 'tenant') {
        await page.keyboard.press('Alt+Shift+2')
        await expect(page.getByTestId('scope-value')).toHaveText(
          '22222222-2222-4222-8222-222222222222'
        )
      } else {
        await page.keyboard.press('Alt+Shift+3')
        await expect(submit(1)).toHaveCount(0)
        await expect(submit(2)).toHaveCount(0)
      }
      await confirm.getByRole('button', { name: '提交审批', exact: true }).click()
      await expect(confirm).toBeHidden()
      await expect(
        page.getByText('操作范围或权限已变化，请重新查询后提交', { exact: true })
      ).toBeVisible()
      await page.waitForLoadState('networkidle')
      expect(calls).toEqual([])
      await page
        .getByRole('button', {
          name: mode === 'tenant' ? '切换租户1' : '恢复操作权限',
          exact: true
        })
        .click()
      await submit(1).click()
      await confirm.getByRole('button', { name: '取消', exact: true }).click()
      await expect(submit(1)).toBeEnabled()
      await expect(submit(2)).toBeEnabled()
      expect(calls).toEqual([])
      for (const i of [1, 2]) {
        await submit(i).click()
        await confirm.getByRole('button', { name: '提交审批', exact: true }).click()
        if (i === 1) {
          await expect(submit(i)).toBeEnabled()
          await submit(i).click()
          await confirm.getByRole('button', { name: '提交审批', exact: true }).click()
        }
        await expect(submit(i)).toHaveCount(0)
      }
      expect(calls).toEqual(['submit-1', 'submit-1', 'submit-2'])
    })
  }
