import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })

for (const [kind, permission] of [
  ['estimated', 'FinanceEstimatedPayable'],
  ['financial', 'FinancePurchasePayable'],
  ['application', 'FinancePayableApplication'],
  ['payment', 'FinancePayablePayment'],
  ['refund', 'FinancePayableRefund']
]) {
  test(`${kind} 普通只读用户查询两条记录且不暴露业务写入和导出`, async ({ page }) => {
    const writes: string[] = []
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1) || ''
      if (/save|act_|push|voucher/.test(name)) writes.push(name)
      if (
        name === 'fms_purchase_payable_list_secure' ||
        name === 'fms_payable_settlement_list_secure'
      )
        return route.fulfill({
          json: {
            data: [1, 2].map((index) => ({
              id: `view-${index}`,
              record_key: `view-${index}`,
              document_no: `QA-VIEW-${index}`,
              tenant_id: '11111111-1111-4111-8111-111111111111',
              status: 'draft',
              kind,
              currency_code: 'CNY',
              amount: index * 100,
              total_amount: index * 100,
              business_date: '2026-10-24',
              lines: []
            })),
            total: 2
          }
        })
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&permissions=${permission}:View`
    )
    await expect(page.getByText('QA-VIEW-2', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(page.getByText('QA-VIEW-1', { exact: true })).toBeVisible()
    await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
    for (const label of [
      '新增',
      '编辑',
      '提交',
      '审核',
      '删除',
      '下推',
      '冻结',
      '解冻',
      '关闭',
      '确认付款',
      '确认到账',
      '生成凭证',
      '作废未到账单',
      '作废未付款单',
      '打印',
      '导出'
    ])
      await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0)
    expect(writes).toEqual([])
  })
}
