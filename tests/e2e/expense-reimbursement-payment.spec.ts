import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)

for (const demo of [true, false]) {
  test(`${demo ? '模拟' : '真实登记入口'}两张报销多收款人分次付款与响应丢失重试`, async ({
    page
  }, info) => {
    const tenant = '11111111-1111-4111-8111-111111111111'
    const records = [1, 2].map((index) => ({
      id: `reimbursement-${index}`,
      tenant_id: tenant,
      reimbursement_no: `QA-REIMBURSE-PAY-${index}`,
      source_type: 'travel',
      is_demo: demo,
      status: 'approved',
      amount: 100,
      paid_amount: 0,
      remaining_amount: 100,
      attachment_urls: [],
      applicant_name_snapshot: '隔离费用验收员工',
      payees: [
        {
          id: `payee-${index}-1`,
          payee_name_snapshot: '第一收款人',
          bank_name_snapshot: '隔离验收银行',
          settlement_method: 'bank_transfer',
          amount: 40,
          paid_amount: 0,
          remaining_amount: 40
        },
        {
          id: `payee-${index}-2`,
          payee_name_snapshot: '第二收款人',
          bank_name_snapshot: '隔离验收银行',
          settlement_method: 'cash',
          amount: 60,
          paid_amount: 0,
          remaining_amount: 60
        }
      ]
    }))
    const keys = new Set<string>()
    const lost = new Set<string>()
    const calls: Array<{
      p_reimbursement_id: string
      p_payee_id: string
      p_idempotency_key: string
      p_amount: number
    }> = []
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
                  ['approved', '已通过'],
                  ['partially_paid', '部分付款'],
                  ['paid', '已付款']
                ]
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
      if (name === 'fms_list_expense_reimbursements_secure')
        return route.fulfill({ json: { records, total: records.length } })
      if (name === 'tms_get_expense_reimbursement_secure')
        return route.fulfill({
          json: records.find((row) => row.id === route.request().postDataJSON().p_id)
        })
      if (name === 'fms_list_fund_account_options_secure')
        return route.fulfill({
          json: [
            {
              id: 'foreign',
              tenant_id: '22222222-2222-4222-8222-222222222222',
              account_name: demo ? '界面验收其他租户' : '其他租户账户'
            },
            {
              id: 'own',
              tenant_id: tenant,
              account_name: demo ? '界面验收本租户账户' : '隔离本租户账户'
            }
          ]
        })
      if (name === 'record_fms_travel_reimbursement_payment_secure') {
        const body = route.request().postDataJSON()
        calls.push(body)
        expect(body.p_demo).toBe(demo)
        expect(body.p_fund_account_id).toBe('own')
        expect(body.p_idempotency_key).toMatch(/^[0-9a-f-]{36}$/)
        const row = records.find((row) => row.id === body.p_reimbursement_id)
        const payee = row?.payees.find((payee) => payee.id === body.p_payee_id)
        if (!row || !payee) return route.fulfill({ status: 404, json: {} })
        if (!keys.has(body.p_idempotency_key)) {
          keys.add(body.p_idempotency_key)
          payee.paid_amount += body.p_amount
          payee.remaining_amount -= body.p_amount
          row.paid_amount += body.p_amount
          row.remaining_amount -= body.p_amount
          row.status = row.remaining_amount === 0 ? 'paid' : 'partially_paid'
        }
        if (!lost.has(row.id)) {
          lost.add(row.id)
          return route.abort('failed')
        }
        return route.fulfill({
          json: { id: row.id, paid_amount: row.paid_amount, status: row.status }
        })
      }
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    const permission = demo ? 'SimulatePayment' : 'Pay'
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_reimbursement&theme=${theme}&permissions=FinanceExpenseReimbursement:View,FinanceExpenseReimbursement:${permission}`
    )
    for (const record of records) {
      await expect(page.locator('.el-message')).toHaveCount(0)
      const row = page.getByRole('row').filter({ hasText: record.reimbursement_no })
      const entry = row.getByRole('button', { name: demo ? '模拟付款' : '登记付款', exact: true })
      const dialog = page.getByRole('dialog', {
        name: `${demo ? '模拟报销付款' : '登记报销付款'} · ${record.reimbursement_no}`,
        exact: true
      })
      const amount = dialog.getByRole('spinbutton', { name: /本次付款金额（元）$/ })
      const save = dialog.getByRole('button', {
        name: demo ? '记录模拟付款' : '登记已付款',
        exact: true
      })
      for (const [step, expected] of [40, 20, 60].entries()) {
        await entry.click()
        await expect(amount).toHaveValue(`${expected}.00`)
        await expect(
          dialog.getByText(demo ? '界面验收本租户账户' : '隔离本租户账户', { exact: true })
        ).toBeVisible()
        if (step === 0) await amount.fill('20')
        const reference = dialog.getByRole('textbox', {
          name: demo ? /演示流水号$/ : step === 2 ? /收款确认号$/ : /银行流水号$/
        })
        await reference.fill(`MOCK-${record.id}-${step}`)
        if (step === 2 && record.id === 'reimbursement-2') {
          await expect(page.locator('.el-message')).toHaveCount(0)
          await dialog.screenshot({ path: info.outputPath('reimbursement-second-payee.png') })
        }
        await save.click()
        if (step === 0) {
          await expect(page.locator('.el-message--error')).toHaveCount(1)
          await expect(amount).toHaveValue('20.00')
          const key = calls.at(-1)?.p_idempotency_key
          await save.click()
          await expect(dialog).toBeHidden()
          expect(calls.at(-1)?.p_idempotency_key).toBe(key)
          expect(record.paid_amount).toBe(20)
        } else await expect(dialog).toBeHidden()
        if (step === 1) {
          expect(record.payees[0].remaining_amount).toBe(0)
          expect(record.paid_amount).toBe(40)
        }
      }
      await expect(entry).toHaveCount(0)
      expect(record.paid_amount).toBe(100)
      expect(record.payees.every((payee) => payee.remaining_amount === 0)).toBe(true)
    }
    expect(calls).toHaveLength(8)
    expect(keys.size).toBe(6)
  })
}
