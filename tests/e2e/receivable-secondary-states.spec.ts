import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)

for (const kind of ['refund', 'revenue'] as const) {
  test(`${kind}业务状态限制付款申请和凭证按钮`, async ({ page }, info) => {
    const writes: string[] = []
    const records = ['draft', 'submitted', 'approved', kind === 'refund' ? 'paid' : 'rejected'].map(
      (status, i) => ({
        id: `${kind}-${i}`,
        tenant_id: '11111111-1111-4111-8111-111111111111',
        document_no: `QA-STATE-${i}`,
        status,
        customer_name: `验收客户${i}`,
        currency_code: 'CNY',
        amount: 100 + i,
        revenue_amount: 100 + i,
        cost_amount: 50,
        business_date: '2026-10-25',
        lines: []
      })
    )
    await page.route('**/rest/v1/**', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1) || ''
      if (name === 'fms_receivable_workspace_secure')
        return route.fulfill({ json: { records, total: records.length } })
      if (/act_|voucher/.test(name)) writes.push(name)
      return route.fulfill({ json: [] })
    })
    const prefix = kind === 'refund' ? 'FinanceReceiptRefund' : 'FinanceRevenueCost'
    const permissions = [
      'View',
      ...(kind === 'refund' ? ['PaymentRequest'] : ['VoucherPreview', 'VoucherGenerate'])
    ]
      .map((action) => `${prefix}:${action}`)
      .join(',')
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=${kind}&theme=${theme}&permissions=${permissions}`
    )
    await expect(page.getByText('QA-STATE-0', { exact: true })).toBeVisible({ timeout: 60000 })
    const labels = kind === 'refund' ? ['生成付款申请'] : ['预览凭证', '生成凭证']
    for (let i = 0; i < records.length; i++) {
      const selection = page
        .getByRole('row')
        .filter({ hasText: `QA-STATE-${i}` })
        .locator('label.el-checkbox')
      await selection.click()
      for (const label of labels) {
        const button = page.getByRole('button', { name: label, exact: true })
        if (i === 2) await expect(button).toBeEnabled()
        else await expect(button).toBeDisabled()
      }
      if (i === 0 || i === 2)
        await page.screenshot({ path: info.outputPath(`secondary-state-${i}.png`), fullPage: true })
      await selection.click()
    }
    for (const i of [0, 2])
      await page
        .getByRole('row')
        .filter({ hasText: `QA-STATE-${i}` })
        .locator('label.el-checkbox')
        .click()
    for (const label of labels)
      await expect(page.getByRole('button', { name: label, exact: true })).toBeDisabled()
    expect(writes).toHaveLength(0)
  })
}
