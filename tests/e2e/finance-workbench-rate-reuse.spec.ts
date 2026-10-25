import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, locale: 'ar-EG' })

for (const state of ['readable', 'masked', 'bounds']) {
  test(`财务工作台复用公共百分比 state=${state}`, async ({ page }, info) => {
    const masked = state === 'masked'
    const bounds = state === 'bounds'
    test.setTimeout(180_000)
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/rpc/tms_get_finance_workbench_secure', (route) =>
      route.fulfill({
        json: {
          receiptCompletionRate: bounds ? 120 : masked ? '***' : 12.34567,
          paymentCompletionRate: bounds ? -15 : 0,
          invoiceMatchRate: null,
          costApprovalRate: masked ? '***' : '98.7654',
          monthRevenueAmount: masked ? '***' : 100,
          monthGrossProfit: masked ? '***' : 12.34567,
          fieldAccess: Object.fromEntries(
            [
              'customerSettlementAmounts',
              'carrierSettlementAmounts',
              'cashFlowAmounts',
              'operatingAmounts',
              'invoiceAmounts'
            ].map((key) => [key, 'read'])
          )
        }
      })
    )
    await page.route('**/rest/v1/rpc/fms_accounting_workload_summary_secure', (route) =>
      route.fulfill({ json: {} })
    )
    await page.goto('/tests/e2e/fixtures/explicit-locale-reuse.html?mode=finance-workbench')
    await expect(page.getByText('财务工作台', { exact: true })).toBeVisible({ timeout: 120_000 })
    for (const [label, value] of [
      ['客户回款完成率', bounds ? '120.00%' : masked ? '***' : '12.35%'],
      ['承运商付款完成率', bounds ? '-15.00%' : '0.00%'],
      ['发票匹配完成率', '—'],
      ['费用审核完成率', masked ? '***' : '98.77%']
    ]) {
      const item = page.locator('.finance-workbench__progress-item').filter({ hasText: label })
      await expect(item.locator('.el-progress__text')).toHaveText(value)
      await expect(item.locator('.el-progress')).toHaveAttribute('aria-label', `${label} ${value}`)
    }
    for (const [label, percent] of [
      ['客户回款完成率', bounds ? '100' : masked ? '0' : '12.34567'],
      ['承运商付款完成率', '0'],
      ['发票匹配完成率', '0'],
      ['费用审核完成率', masked ? '0' : '98.7654']
    ]) {
      await expect(
        page
          .locator('.finance-workbench__progress-item')
          .filter({ hasText: label })
          .locator('.el-progress')
      ).toHaveAttribute('aria-valuenow', percent)
    }
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
    await page.screenshot({ path: info.outputPath('finance-workbench.png'), fullPage: true })
  })
}
