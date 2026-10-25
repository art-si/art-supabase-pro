import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)

for (const kind of ['loan', 'repayment'] as const) {
  test(`${kind}零余额、部分余额与完成状态的资金按钮`, async ({ page }, info) => {
    let status = 'approved'
    let balance = 0
    let demo = true
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
            : [
                ['approved', '已通过'],
                ['awaiting_payment', '待付款'],
                ['awaiting_collection', '待收款'],
                ['paid', '已付款'],
                ['collected', '已收款']
              ]
        return route.fulfill({
          json: [
            'fmsExpenseDocumentStatus',
            'fmsRepaymentStatus',
            'commonDocumentDisplayMode'
          ].includes(code)
            ? entries.map(([value, label]) => ({
                id: value,
                code: value,
                value,
                label,
                status: '1',
                dict_type_table: { code }
              }))
            : []
        })
      }
      if (name === (kind === 'loan' ? 'fms_travel_loan' : 'fms_travel_repayment'))
        return route.fulfill({
          json: [1, 2].map((index) => ({
            id: `state-${index}`,
            tenant_id: '11111111-1111-4111-8111-111111111111',
            loan_no: `QA-BALANCE-${index}`,
            repayment_no: `QA-BALANCE-${index}`,
            status,
            is_demo: demo,
            applicant_name: '隔离费用验收员工',
            loan_amount: 100,
            amount: 100,
            approved_amount: 100,
            paid_amount: kind === 'loan' && status === 'paid' ? 100 : 100 - balance,
            received_amount: 100 - balance,
            remaining_balance: balance,
            attachment_urls: []
          })),
          headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
        })
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_${kind}&theme=${theme}`
    )
    for (const entry of [
      { status: 'approved', balance: 0, demo: true },
      {
        status: kind === 'loan' ? 'awaiting_payment' : 'awaiting_collection',
        balance: 40,
        demo: true
      },
      { status: 'approved', balance: 40, demo: false },
      { status: kind === 'loan' ? 'paid' : 'collected', balance: 0, demo: false },
      { status: 'paid', balance: 40, demo: false }
    ]) {
      status = entry.status
      balance = entry.balance
      demo = entry.demo
      await page.getByRole('button', { name: '查询', exact: true }).click()
      const row = page.getByRole('row').filter({ hasText: 'QA-BALANCE-1' })
      await expect(row).toBeVisible()
      const name =
        kind === 'loan' ? (demo ? '模拟付款' : '登记付款') : demo ? '模拟收款' : '确认收款'
      const eligible =
        balance > 0 &&
        (kind === 'loan'
          ? ['approved', 'awaiting_payment']
          : ['approved', 'awaiting_collection']
        ).includes(status)
      await expect(row.getByRole('button', { name, exact: true })).toHaveCount(eligible ? 1 : 0)
      if (kind === 'loan') {
        await row.locator('label.el-checkbox').click()
        const push = page.getByRole('button', { name: '下推', exact: true })
        if (status === 'paid' && balance > 0) await expect(push).toBeEnabled()
        else await expect(push).toBeDisabled()
      }
    }
    await page.screenshot({ path: info.outputPath(`${kind}-balance-buttons.png`), fullPage: true })
  })
}

test('两张还款单部分收款响应丢失后原请求重试不重复登记，新一笔使用新请求键', async ({
  page
}, info) => {
  const rows = [1, 2].map((index) => ({
    id: `repayment-${index}`,
    tenant_id: '11111111-1111-4111-8111-111111111111',
    repayment_no: `QA-COLLECT-${index}`,
    status: 'approved',
    amount: index * 100,
    received_amount: 0,
    applicant_name: '隔离还款验收员工',
    is_demo: true,
    attachment_urls: []
  }))
  const receipts = new Map<string, { repaymentId: string; amount: number }>()
  const calls: Array<{ p_repayment_id: string; p_amount: number; p_idempotency_key: string }> = []
  const lost = new Set<string>()
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    if (name === 'sys_dictionary') {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      return route.fulfill({
        json:
          code === 'fmsRepaymentStatus' || code === 'commonDocumentDisplayMode'
            ? (code === 'commonDocumentDisplayMode'
                ? [
                    ['document', '单据'],
                    ['line', '明细']
                  ]
                : [
                    ['approved', '已通过'],
                    ['awaiting_collection', '待收款'],
                    ['collected', '已收款']
                  ]
              ).map(([value, label]) => ({
                id: value,
                code: value,
                value,
                label,
                status: '1',
                dict_type_table: { code }
              }))
            : []
      })
    }
    if (name === 'fms_travel_repayment')
      return route.fulfill({
        json: rows,
        headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
      })
    if (name === 'record_fms_travel_repayment_collection_secure') {
      const body = route.request().postDataJSON()
      calls.push(body)
      expect(body.p_idempotency_key).toMatch(/^[0-9a-f-]{36}$/)
      const row = rows.find((row) => row.id === body.p_repayment_id)
      expect(row).toBeDefined()
      if (!row) return route.fulfill({ status: 404, json: {} })
      const recorded = receipts.get(body.p_idempotency_key)
      if (!recorded) {
        receipts.set(body.p_idempotency_key, { repaymentId: row.id, amount: body.p_amount })
        row.received_amount += body.p_amount
        row.status = row.received_amount === row.amount ? 'collected' : 'awaiting_collection'
      } else expect(recorded).toEqual({ repaymentId: row.id, amount: body.p_amount })
      if (!lost.has(row.id)) {
        lost.add(row.id)
        return route.abort('failed')
      }
      return route.fulfill({
        json: { id: row.id, receivedAmount: row.received_amount, status: row.status }
      })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_repayment&theme=${theme}&permissions=${encodeURIComponent('FinanceRepayment:View,FinanceRepayment:Collect')}`
  )
  for (const index of [1, 2]) {
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    const row = page.getByRole('row').filter({ hasText: `QA-COLLECT-${index}` })
    await row.getByRole('button', { name: '模拟收款', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `模拟收款 · QA-COLLECT-${index}`, exact: true })
    const amount = dialog.getByRole('spinbutton', { name: /本次收款金额（元）$/ })
    await amount.fill(String(index * 40))
    await dialog.getByRole('textbox', { name: '银行流水号', exact: true }).click()
    const save = dialog.getByRole('button', { name: '记录模拟收款', exact: true })
    await save.click()
    await expect(page.locator('.el-message--error')).toHaveCount(1)
    await expect(dialog).toBeVisible()
    await expect(page.locator('.el-message--error')).not.toContainText('TypeError')
    if (index === 1)
      await page.screenshot({
        path: info.outputPath('repayment-response-lost.png'),
        fullPage: true
      })
    const firstKey = calls.at(-1)?.p_idempotency_key
    await save.click()
    await expect(dialog).not.toBeVisible()
    expect(calls.at(-1)?.p_idempotency_key).toBe(firstKey)
    expect(rows[index - 1].received_amount).toBe(index * 40)
    await row.getByRole('button', { name: '模拟收款', exact: true }).click()
    await expect(amount).toHaveValue(`${index * 60}.00`)
    if (index === 2) {
      await expect(page.locator('.el-message')).toHaveCount(0)
      await dialog.screenshot({ path: info.outputPath('repayment-final-collection.png') })
    }
    await save.click()
    await expect(dialog).not.toBeVisible()
    expect(calls.at(-1)?.p_idempotency_key).not.toBe(firstKey)
    await expect(row.getByRole('button', { name: '模拟收款', exact: true })).toHaveCount(0)
    expect(rows[index - 1].received_amount).toBe(index * 100)
  }
  expect(calls).toHaveLength(6)
  expect(receipts.size).toBe(4)
})
