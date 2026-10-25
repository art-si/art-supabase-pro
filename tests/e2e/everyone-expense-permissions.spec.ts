import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

for (const config of [
  {
    kind: 'payee',
    title: '收款信息',
    permission: 'FinancePayeeInformation',
    resource: 'fms_payee_information',
    number: 'payee_name'
  },
  {
    kind: 'travel',
    title: '出差申请单',
    permission: 'FinanceTravelApplication',
    resource: 'fms_travel_application',
    number: 'application_no'
  },
  {
    kind: 'loan',
    title: '借款单',
    permission: 'FinanceLoanApplication',
    resource: 'fms_travel_loan',
    number: 'loan_no'
  },
  {
    kind: 'repayment',
    title: '还款单',
    permission: 'FinanceRepayment',
    resource: 'fms_travel_repayment',
    number: 'repayment_no'
  },
  {
    kind: 'reimbursement',
    title: '费用报销单',
    permission: 'FinanceExpenseReimbursement',
    resource: 'fms_list_expense_reimbursements_secure',
    number: 'reimbursement_no'
  }
]) {
  test(`${config.title} 普通只读用户保留查询并隐藏写入动作`, async ({ page }, info) => {
    const writes: string[] = []
    await page.route('**/rest/v1/**', (route) => {
      const resource = new URL(route.request().url()).pathname.split('/').at(-1)
      if (route.request().method() !== 'GET' && resource !== config.resource)
        writes.push(resource || '')
      const records = [1, 2].map((index) => ({
        id: `permission-record-${index}`,
        tenant_id: '11111111-1111-4111-8111-111111111111',
        [config.number]: `QA-READONLY-${index}`,
        status: 'draft',
        source_type: 'travel',
        is_demo: true,
        attachment_urls: []
      }))
      if (resource !== config.resource) return route.fulfill({ json: [] })
      return route.fulfill({
        json: config.kind === 'reimbursement' ? { records, total: 2 } : records,
        headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
      })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_${config.kind}&theme=${theme}&permissions=${config.permission}:View`
    )
    await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/)
    await expect(page.getByRole('heading', { name: config.title, exact: true })).toBeVisible()
    await expect(page.getByText('QA-READONLY-1', { exact: true })).toBeVisible()
    await expect(page.getByText('QA-READONLY-2', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('button', {
        name: /新增|编辑|复制|删除|提交审批|模拟付款|登记付款|确认收款|一键获取员工/
      })
    ).toHaveCount(0)
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(page.getByText('QA-READONLY-2', { exact: true })).toBeVisible()
    expect(writes).toEqual([])
  })
}

test('费用模块复制需要同时具备复制和新增权限，两张来源单一致', async ({ page }) => {
  test.setTimeout(120000)
  let kind = 'reimbursement'
  const configs = [
    {
      kind: 'reimbursement',
      permission: 'FinanceExpenseReimbursement',
      resource: 'fms_list_expense_reimbursements_secure',
      number: 'reimbursement_no',
      copy: '复制'
    },
    {
      kind: 'loan',
      permission: 'FinanceLoanApplication',
      resource: 'fms_travel_loan',
      number: 'loan_no',
      copy: '复制借款单'
    },
    {
      kind: 'repayment',
      permission: 'FinanceRepayment',
      resource: 'fms_travel_repayment',
      number: 'repayment_no',
      copy: '复制还款单'
    },
    {
      kind: 'travel',
      permission: 'FinanceTravelApplication',
      resource: 'fms_travel_application',
      number: 'application_no',
      copy: '复制出差申请'
    },
    {
      kind: 'payee',
      permission: 'FinancePayeeInformation',
      resource: 'fms_payee_information',
      number: 'payee_name',
      copy: '复制'
    }
  ]
  await page.route('**/rest/v1/**', (route) => {
    const config = configs.find((config) => config.kind === kind)!
    if (new URL(route.request().url()).pathname.split('/').at(-1) !== config.resource)
      return route.fulfill({ json: [] })
    const records = [1, 2].map((index) => ({
      id: `copy-permission-${index}`,
      tenant_id: '11111111-1111-4111-8111-111111111111',
      [config.number]: `QA-COPY-PERMISSION-${index}`,
      status: 'draft',
      source_type: 'travel',
      attachment_urls: []
    }))
    return route.fulfill({ json: kind === 'reimbursement' ? { records, total: 2 } : records })
  })
  for (const config of configs) {
    kind = config.kind
    for (const grants of [['Copy'], ['Add'], [], ['Copy', 'Add']]) {
      const permissions = [
        `${config.permission}:View`,
        ...grants.map((grant) => `${config.permission}:${grant}`)
      ]
      await page.goto(
        `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_${kind}&permissions=${permissions.join(',')}`
      )
      for (const index of [1, 2]) {
        const row = page.getByRole('row').filter({ hasText: `QA-COPY-PERMISSION-${index}` })
        await expect(row).toBeVisible()
        if (kind === 'payee') {
          const more = row.getByRole('button', { name: '更多操作', exact: true })
          if (!grants.includes('Copy')) await expect(more).toHaveCount(0)
          else {
            await more.click()
            const item = page.getByRole('menuitem', { name: '复制', exact: true })
            if (grants.includes('Add')) await expect(item).toBeEnabled()
            else await expect(item).toBeDisabled()
            await page.keyboard.press('Escape')
          }
          continue
        }
        const copy = row.getByRole('button', { name: config.copy, exact: true })
        if (!grants.includes('Copy')) await expect(copy).toHaveCount(0)
        else if (grants.includes('Add')) await expect(copy).toBeEnabled()
        else await expect(copy).toBeDisabled()
      }
    }
  }
})
