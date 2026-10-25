import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)

for (const demo of [true, false]) {
  test(`${demo ? '模拟' : '真实登记入口'}两张借款部分付款响应丢失重试及付清状态`, async ({
    page
  }, info) => {
    const rows = [1, 2].map((index) => ({
      id: `payment-loan-${index}`,
      tenant_id: '11111111-1111-4111-8111-111111111111',
      loan_no: `QA-PAY-${index}`,
      applicant_name: '隔离付款验收员工',
      status: 'approved',
      is_demo: demo,
      approved_amount: index * 100,
      paid_amount: 0,
      attachment_urls: [],
      payees: [
        {
          id: `payee-${index}`,
          payee_name: '隔离收款人',
          bank_name: demo ? '验收银行不可用于实际付款' : '隔离银行',
          bank_account: demo ? `TEST-FMS-${index}` : `MOCK-ONLY-${index}`,
          amount: index * 100
        }
      ],
      payments: [] as Array<{ loan_payee_id: string; amount: number }>
    }))
    const calls: Array<{
      p_loan_id: string
      p_loan_payee_id: string
      p_amount: number
      p_idempotency_key: string
      p_demo: boolean
      p_fund_account_id: string
    }> = []
    const recorded = new Set<string>()
    const lost = new Set<string>()
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
            : code === 'fmsExpenseDocumentStatus'
              ? [
                  ['approved', '已通过'],
                  ['awaiting_payment', '待付款'],
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
      if (name === 'fms_travel_loan') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return route.fulfill({ json: id ? rows.find((row) => row.id === id) : rows })
      }
      if (name === 'fms_list_fund_account_options_secure')
        return route.fulfill({
          json: [
            {
              id: 'foreign-demo',
              tenant_id: '22222222-2222-4222-8222-222222222222',
              account_name: '界面验收其他租户账户'
            },
            {
              id: 'foreign-live',
              tenant_id: '22222222-2222-4222-8222-222222222222',
              account_name: '其他租户实际账户'
            },
            {
              id: 'demo-account',
              tenant_id: rows[0].tenant_id,
              account_name: '界面验收专用资金账户'
            },
            {
              id: 'live-mock-account',
              tenant_id: rows[0].tenant_id,
              account_name: '隔离真实入口测试账户'
            }
          ]
        })
      if (name === 'record_fms_travel_loan_payment_secure') {
        const body = route.request().postDataJSON()
        calls.push(body)
        const row = rows.find((row) => row.id === body.p_loan_id)
        expect(row).toBeDefined()
        if (!row) return route.fulfill({ status: 404, json: {} })
        expect(body.p_demo).toBe(demo)
        expect(body.p_fund_account_id).toBe(demo ? 'demo-account' : 'live-mock-account')
        expect(body.p_idempotency_key).toMatch(/^[0-9a-f-]{36}$/)
        if (!recorded.has(body.p_idempotency_key)) {
          recorded.add(body.p_idempotency_key)
          row.paid_amount += body.p_amount
          row.payments.push({ loan_payee_id: body.p_loan_payee_id, amount: body.p_amount })
          row.status = row.paid_amount === row.approved_amount ? 'paid' : 'awaiting_payment'
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
      `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_loan&theme=${theme}&permissions=FinanceLoanApplication:View,FinanceLoanApplication:${permission}`
    )
    for (const index of [1, 2]) {
      await expect(page.locator('.el-message--error')).toHaveCount(0)
      const row = page.getByRole('row').filter({ hasText: `QA-PAY-${index}` })
      const entry = row.getByRole('button', { name: demo ? '模拟付款' : '登记付款', exact: true })
      await entry.click()
      const dialog = page.getByRole('dialog', {
        name: demo ? '模拟借款付款' : '登记借款付款',
        exact: true
      })
      const amount = dialog.getByRole('spinbutton', { name: /本次付款金额（元）$/ })
      await expect(
        dialog.getByText(demo ? '界面验收专用资金账户' : '隔离真实入口测试账户', { exact: true })
      ).toBeVisible()
      await expect(amount).toHaveValue(`${index * 100}.00`)
      await amount.fill(String(index * 40))
      await dialog
        .getByRole('textbox', { name: demo ? /演示流水号$/ : /银行流水号$/ })
        .fill(`MOCK-REFERENCE-${index}`)
      const save = dialog.getByRole('button', {
        name: demo ? '记录模拟付款' : '登记已付款',
        exact: true
      })
      await save.click()
      await expect(page.locator('.el-message--error')).toHaveCount(1)
      await expect(amount).toHaveValue(`${index * 40}.00`)
      const firstKey = calls.at(-1)?.p_idempotency_key
      await save.click()
      await expect(dialog).toBeHidden()
      expect(calls.at(-1)?.p_idempotency_key).toBe(firstKey)
      expect(rows[index - 1].paid_amount).toBe(index * 40)
      await entry.click()
      await expect(amount).toHaveValue(`${index * 60}.00`)
      if (!demo)
        await dialog.getByRole('textbox', { name: /银行流水号$/ }).fill(`MOCK-FINAL-${index}`)
      if (index === 2) {
        await expect(page.locator('.el-message')).toHaveCount(0)
        await dialog.screenshot({ path: info.outputPath('loan-partial-payment.png') })
      }
      await save.click()
      await expect(dialog).toBeHidden()
      expect(calls.at(-1)?.p_idempotency_key).not.toBe(firstKey)
      await expect(entry).toHaveCount(0)
      expect(rows[index - 1].paid_amount).toBe(index * 100)
    }
    expect(calls).toHaveLength(6)
    expect(recorded.size).toBe(4)
  })
}

test('付款入口重新读取状态，拦截已付清、审批中和演示类型变化', async ({ page }) => {
  let detailStatus = 'paid'
  let detailDemo = true
  let detailPaid = 100
  let paymentCalls = 0
  const source = {
    id: 'stale-loan',
    tenant_id: '11111111-1111-4111-8111-111111111111',
    loan_no: 'QA-STALE-PAY',
    status: 'approved',
    is_demo: true,
    approved_amount: 100,
    paid_amount: 0,
    attachment_urls: []
  }
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    if (name === 'fms_travel_loan')
      return route.fulfill({
        json: url.searchParams.has('id')
          ? { ...source, status: detailStatus, is_demo: detailDemo, paid_amount: detailPaid }
          : [source]
      })
    if (name === 'record_fms_travel_loan_payment_secure') paymentCalls++
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/receivable-workspace.html?kind=expense_loan')
  for (const variant of [
    { status: 'paid', paid: 100, demo: true },
    { status: 'pending_review', paid: 0, demo: true },
    { status: 'approved', paid: 0, demo: false },
    { status: 'approved', paid: 100, demo: true }
  ]) {
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    detailStatus = variant.status
    detailPaid = variant.paid
    detailDemo = variant.demo
    await page.getByRole('button', { name: '模拟付款', exact: true }).click()
    await expect(
      page.getByText('借款状态或待付金额已变化，请刷新列表后重试', { exact: true })
    ).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  expect(paymentCalls).toBe(0)
})

test('普通本租户、伪造选择和平台全部或指定租户付款只使用单据租户账户', async ({ page }) => {
  const home = '11111111-1111-4111-8111-111111111111'
  const foreign = '22222222-2222-4222-8222-222222222222'
  let recordTenant = home
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    if (name === 'fms_travel_loan') {
      const record = {
        id: 'tenant-loan',
        tenant_id: recordTenant,
        loan_no: 'QA-TENANT-PAY',
        status: 'approved',
        is_demo: true,
        approved_amount: 100,
        paid_amount: 0,
        attachment_urls: [],
        payments: [],
        payees: [{ id: 'tenant-payee', payee_name: '测试收款人', amount: 100 }]
      }
      return route.fulfill({ json: url.searchParams.has('id') ? record : [record] })
    }
    if (name === 'fms_list_fund_account_options_secure')
      return route.fulfill({
        json: [
          {
            id: 'wrong-account',
            tenant_id: recordTenant === home ? foreign : home,
            account_name: '界面验收其他租户'
          },
          { id: 'right-account', tenant_id: recordTenant, account_name: '界面验收单据租户' }
        ]
      })
    return route.fulfill({ json: [] })
  })
  for (const scenario of [
    { ordinary: true, scope: home, tenant: home },
    { ordinary: true, scope: foreign, tenant: home },
    { ordinary: false, scope: 'all', tenant: foreign },
    { ordinary: false, scope: foreign, tenant: foreign }
  ]) {
    recordTenant = scenario.tenant
    const permissions = scenario.ordinary
      ? '&permissions=FinanceLoanApplication:View,FinanceLoanApplication:SimulatePayment'
      : ''
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_loan&scopeTenant=${scenario.scope}${permissions}`
    )
    await page.getByRole('button', { name: '模拟付款', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '模拟借款付款', exact: true })
    await expect(dialog.getByText('界面验收单据租户', { exact: true })).toBeVisible()
    await dialog.getByRole('combobox', { name: /付款资金账户$/ }).click()
    await expect(page.getByRole('option', { name: '界面验收其他租户', exact: true })).toHaveCount(0)
    await page.getByRole('option', { name: '界面验收单据租户', exact: true }).click()
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toBeHidden()
  }
})

test('借款多收款人只显示尚待付款明细，金额上限随所选明细变化', async ({ page }) => {
  const tenant = '11111111-1111-4111-8111-111111111111'
  const record = {
    id: 'multi-payee',
    tenant_id: tenant,
    loan_no: 'QA-MULTI-PAYEE',
    status: 'awaiting_payment',
    is_demo: true,
    approved_amount: 100,
    paid_amount: 30,
    attachment_urls: [],
    payees: [
      { id: 'paid', payee_name: '已付清收款人', bank_name: '测试银行', amount: 30 },
      { id: 'pending-small', payee_name: '待付二十', bank_name: '测试银行', amount: 20 },
      { id: 'pending-large', payee_name: '待付五十', bank_name: '测试银行', amount: 50 }
    ],
    payments: [{ loan_payee_id: 'paid', amount: 30 }]
  }
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    if (name === 'fms_travel_loan')
      return route.fulfill({ json: url.searchParams.has('id') ? record : [record] })
    if (name === 'fms_list_fund_account_options_secure')
      return route.fulfill({
        json: [{ id: 'account', tenant_id: tenant, account_name: '界面验收账户' }]
      })
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/receivable-workspace.html?kind=expense_loan')
  await page.getByRole('button', { name: '模拟付款', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '模拟借款付款', exact: true })
  const amount = dialog.getByRole('spinbutton', { name: /本次付款金额（元）$/ })
  await expect(amount).toHaveValue('20.00')
  await dialog.getByRole('combobox', { name: /收款明细$/ }).click()
  await expect(page.getByRole('option', { name: /已付清收款人/ })).toHaveCount(0)
  await page.getByRole('option', { name: /待付五十/ }).click()
  await expect(amount).toHaveValue('50.00')
  await amount.fill('60')
  await dialog.getByRole('textbox', { name: /演示流水号$/ }).click()
  await expect(amount).toHaveValue('50.00')
  await dialog.getByRole('combobox', { name: /收款明细$/ }).click()
  await page.getByRole('option', { name: /待付二十/ }).click()
  await expect(amount).toHaveValue('20.00')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
})
