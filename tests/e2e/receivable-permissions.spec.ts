import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(60000)
const tenant = '11111111-1111-4111-8111-111111111111'

for (const [kind, permission] of [
  ['estimate', 'FinanceEstimatedReceivable'],
  ['financial', 'FinanceFinancialReceivable'],
  ['receipt', 'FinanceReceipt'],
  ['refund', 'FinanceReceiptRefund'],
  ['revenue', 'FinanceRevenueCost'],
  ['payment_request', 'FinanceReceivablePaymentRequest'],
  ['condition', 'MdmReceiptCondition'],
  ['report', 'FinanceReceivableReport'],
  ['writeoff', 'FinanceReceiptWriteoff']
]) {
  test(`${kind} 普通只读用户查询两条数据及业务操作隔离`, async ({ page }, info) => {
    const mutations: string[] = []
    const records = [1, 2].map((index) => ({
      id: `ar-view-${index}`,
      record_key: `ar-view-${index}`,
      tenant_id: tenant,
      document_no: `QA-AR-VIEW-${index}`,
      name: `QA-AR-VIEW-${index}`,
      code: `QA-CONDITION-${index}`,
      customer_name: `QA-AR-VIEW-${index}`,
      currency_code: 'CNY',
      kind: 'financial',
      status: 'draft',
      amount: index * 100,
      total_amount: index * 100,
      revenue_amount: index * 100,
      occurrence_amount: index * 100,
      balance_amount: index * 100,
      source_type: 'financial',
      document_id: `ar-view-${index}`,
      organization_id: 'company',
      settlement_organization_id: 'company',
      customer_id: 'customer',
      outstanding_amount: index * 100,
      available_amount: index * 100,
      lines: [],
      due_days: index * 30,
      business_date: '2026-10-24'
    }))
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.split('/').at(-1) || ''
      if (/save_|act_|delete_|push_|execute_|reverse_|voucher/.test(name)) mutations.push(name)
      if (name === 'fms_receivable_workspace_secure' || name === 'fms_ar_report_secure')
        return route.fulfill({ json: { records, total: 2 } })
      if (name === 'mdm_organization')
        return route.fulfill({
          json: [
            {
              id: 'group',
              tenant_id: tenant,
              parent_id: null,
              organization_name: '验收集团',
              organization_code: 'G',
              status: '1'
            },
            {
              id: 'company',
              tenant_id: tenant,
              parent_id: 'group',
              organization_name: '验收公司',
              organization_code: 'C',
              status: '1'
            }
          ]
        })
      if (name === 'fms_ar_options_secure') {
        const body = route.request().postDataJSON()
        return route.fulfill({
          json: body.p_type.includes('organization')
            ? [{ id: 'company', tenant_id: tenant, name: '验收公司' }]
            : []
        })
      }
      if (name === 'fms_receivable_writeoff_candidates_secure')
        return route.fulfill({
          json: {
            records: [
              ...records,
              ...records.map((row, index) => ({
                ...row,
                id: `receipt-${index}`,
                source_type: 'receipt',
                document_no: `QA-RECEIPT-${index}`
              }))
            ],
            summary: {
              receivable_amount: 300,
              due_this_month_amount: 300,
              unallocated_receipt_amount: 300
            }
          }
        })
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=${kind}&theme=${theme}&permissions=${permission}:View`
    )
    await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/)
    if (kind === 'writeoff') {
      await page.getByRole('combobox', { name: '结算组织', exact: true }).click()
      await page
        .getByRole('treeitem', { name: '验收集团' })
        .locator('.el-tree-node__expand-icon')
        .first()
        .click()
      await page.getByRole('treeitem', { name: '验收公司', exact: true }).click()
      await page.getByRole('button', { name: '查询待核销单据', exact: true }).click()
    } else await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(page.getByText('QA-AR-VIEW-1', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('QA-AR-VIEW-2', { exact: true }).first()).toBeVisible()
    if (kind !== 'report')
      await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
    for (const label of [
      '新增',
      '编辑',
      '提交',
      '审核',
      '批量删除',
      '下推',
      '冻结',
      '解冻',
      '确认付款',
      '确认收款',
      '生成凭证',
      '应收调整',
      '打印',
      '导出',
      '单据查验',
      '核销',
      '特殊核销',
      '核销方案',
      '反核销'
    ])
      await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0)
    if (kind === 'writeoff') {
      await expect(page.getByRole('switch', { name: '允许往来单位不同' })).toBeDisabled()
      await expect(page.getByRole('switch', { name: '异币别核销' })).toBeDisabled()
      await page.getByRole('button', { name: '核销记录', exact: true }).click()
      await expect(page.getByRole('dialog', { name: '核销记录', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: '导出', exact: true })).toHaveCount(0)
    }
    expect(mutations).toEqual([])
  })
}
