import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
for (const mode of ['workbench', 'profit']) {
  test(`${mode} 金额显示保留零值空值和掩码`, async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const url = route.request().url()
      if (url.includes('tms_get_finance_workbench_secure'))
        return route.fulfill({
          json: {
            customer_receivable_balance: 1234.5,
            carrier_payable_balance: '***',
            month_receipt_amount: 0,
            month_gross_profit: null,
            month_revenue_amount: null,
            field_access: {
              customerSettlementAmounts: 'read',
              carrierSettlementAmounts: 'read',
              cashFlowAmounts: 'read',
              operatingAmounts: 'read'
            }
          }
        })
      if (url.includes('tms_list_waybill_profits_secure'))
        return route.fulfill({
          json: {
            records: [
              {
                id: 'profit',
                waybill_no: 'PROFIT-001',
                receivable_amount: 1234.5,
                total_cost_amount: 0,
                carrier_payable_amount: 0,
                other_cost_amount: 0,
                gross_profit: '***',
                field_access: {
                  receivableAmounts: 'read',
                  costAmounts: 'read',
                  profitAmounts: 'read'
                }
              },
              {
                id: 'empty',
                waybill_no: 'PROFIT-EMPTY',
                receivable_amount: null,
                total_cost_amount: null,
                gross_profit: null,
                field_access: {
                  receivableAmounts: 'read',
                  costAmounts: 'read',
                  profitAmounts: 'read'
                }
              }
            ],
            total: 2,
            field_access: { receivableAmounts: 'read', costAmounts: 'read', profitAmounts: 'read' }
          }
        })
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/finance-money-reuse.html?page=${mode}`)
    await expect(page.getByText('¥1,234.50', { exact: true }).first()).toBeVisible({
      timeout: 60_000
    })
    await expect(page.getByText('***', { exact: true }).first()).toBeAttached()
    await expect(page.getByText('¥0.00', { exact: true }).first()).toBeAttached()
    await expect(
      page.getByText(mode === 'workbench' ? '—' : '--', { exact: true }).first()
    ).toBeAttached()
    await expect(page.getByText('¥***', { exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    expect(errors).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`${mode}.png`), fullPage: true })
  })
}
