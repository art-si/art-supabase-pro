import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(60000)

for (const [kind, menu] of [
  ['estimate', 'FinanceEstimatedReceivable'],
  ['financial', 'FinanceFinancialReceivable'],
  ['receipt', 'FinanceReceipt'],
  ['refund', 'FinanceReceiptRefund'],
  ['revenue', 'FinanceRevenueCost'],
  ['payment_request', 'FinanceReceivablePaymentRequest']
]) {
  test(`${kind} 普通只读两条详情对应编号且无保存或编辑控件`, async ({ page }, info) => {
    const mutations: string[] = []
    const records = [1, 2].map((index) => ({
      id: `readonly-${index}`,
      tenant_id: '11111111-1111-4111-8111-111111111111',
      document_no: `QA-DETAIL-${index}`,
      kind,
      status: 'draft',
      business_date: '2026-10-25',
      customer_name: `详情客户${index}`,
      organization_name: '详情结算组织',
      currency_code: 'CNY',
      amount: index * 100,
      total_amount: index * 100,
      revenue_amount: index * 100,
      cost_amount: index * 50,
      source_no: `QA-SOURCE-${index}`,
      lines: [
        {
          id: `line-${index}`,
          line_no: 10,
          description: `详情服务${index}`,
          material_description: `详情服务${index}`,
          basis: 'amount',
          quantity: 0,
          base_quantity: 0,
          unit_price: 0,
          tax_inclusive_unit_price: 0,
          tax_rate: 0,
          tax_amount: 0,
          discount_rate: 0,
          discount_amount: 0,
          total_amount: index * 100,
          entered_gross_amount: index * 100,
          amount: index * 100,
          gross_amount: index * 100,
          revenue_amount: index * 100,
          cost_amount: index * 50
        }
      ]
    }))
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.split('/').at(-1) || ''
      if (name === 'sys_dictionary') {
        const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
        const values =
          code === 'arDocumentStatus'
            ? [['draft', '草稿']]
            : code === 'arDocumentKind'
              ? [
                  ['estimate', '暂估应收'],
                  ['financial', '财务应收']
                ]
              : []
        return route.fulfill({
          json: values.map(([value, label]) => ({
            id: value,
            code: value,
            value,
            label,
            status: '1',
            dict_type_table: { code }
          }))
        })
      }
      if (/save_|act_|delete_|push_|execute_|reverse_|voucher/.test(name)) mutations.push(name)
      if (name === 'fms_receivable_workspace_secure') {
        const query = route.request().postDataJSON().p_query
        const rows = query?.id ? records.filter((row) => row.id === query.id) : records
        return route.fulfill({ json: { records: rows, total: rows.length } })
      }
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=${kind}&theme=${theme}&permissions=${menu}:View`
    )
    await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/)
    for (const index of [1, 2]) {
      const row = page.getByRole('row').filter({ hasText: `QA-DETAIL-${index}` })
      await row.getByRole('button', { name: '查看', exact: true }).click()
      const detail = page.getByRole('dialog')
      await expect(detail).toBeVisible()
      await expect(detail).not.toContainText('undefined')
      await expect(detail).toContainText(`QA-DETAIL-${index}`)
      await expect(detail).not.toContainText(`QA-DETAIL-${index === 1 ? 2 : 1}`)
      if (kind === 'estimate' || kind === 'financial')
        await expect(detail.getByText(/价税合计：/)).toContainText(`${index}00.00`)
      await expect(
        detail.getByRole('button', { name: /保存|新增|添加|删除|提交|审核|确认收款|确认付款/ })
      ).toHaveCount(0)
      await expect(detail.getByRole('spinbutton')).toHaveCount(0)
      await expect(detail.getByRole('textbox')).toHaveCount(0)
      if (index === 2) await detail.screenshot({ path: info.outputPath('readonly-detail.png') })
      await detail.getByRole('button', { name: '关闭此对话框', exact: true }).click()
      await expect(detail).not.toBeVisible()
    }
    expect(mutations).toEqual([])
  })
}
