import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(90_000)
for (const mode of ['receipt', 'payment']) {
  test(`${mode} 核销金额复用公共格式`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({
        json: route.request().url().includes('statement_allocatable_secure')
          ? {
              records: [
                {
                  id: 'test-statement',
                  tenantId: 'test-tenant',
                  statementNo: 'ST-001',
                  customerId: 'test-customer',
                  carrierId: 'test-carrier',
                  periodStart: '2026-10-01',
                  periodEnd: '2026-10-09',
                  statementAmount: 1234.5,
                  settledAmount: 0,
                  outstandingAmount: 1234.5,
                  waybillCount: 1,
                  costCount: 1,
                  status: 'confirmed'
                }
              ],
              total: 1
            }
          : route.request().url().includes('sys_dictionary')
            ? [
                {
                  id: 'test-method',
                  code: 'bank_transfer',
                  label: '银行转账',
                  value: 'bank_transfer',
                  status: '1',
                  sort: 1,
                  dict_type_table: { code: 'tmsCashPaymentMethod', name: '付款方式' }
                }
              ]
            : []
      })
    )
    await page.goto(`/tests/e2e/fixtures/cash-allocation-money.html?mode=${mode}`)
    await page.getByRole('button', { name: '打开核销', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(new RegExp('本笔.*尚有 ¥1,234.50 未核销'))).toBeVisible()
    await expect(dialog.locator('.el-alert')).toContainText(
      '可核销 ¥1,234.50，本次核销 ¥0.00，剩余 ¥1,234.50'
    )
    await dialog
      .getByRole('textbox', {
        name: mode === 'receipt' ? '请选择需要核销的对账单' : '可选择一份或多份对账单',
        exact: true
      })
      .click()
    const selector = page.getByRole('dialog').last()
    const row = selector.getByRole('row').filter({ hasText: 'ST-001' })
    await expect(row).toContainText('¥1,234.50')
    await expect(row).toContainText('¥0.00')
    await row.locator('.el-checkbox').click()
    await expect(row.getByRole('checkbox')).toBeChecked()
    await selector.getByRole('button', { name: '确定', exact: true }).click()
    const allocation = dialog
      .locator('.el-table__body-wrapper')
      .getByRole('row')
      .filter({ hasText: 'ST-001' })
    await expect(allocation.getByText('ST-001', { exact: true })).toBeVisible()
    await expect(allocation.getByText('¥1,234.50', { exact: true })).toBeVisible()
    await expect(dialog.locator('.el-alert')).toContainText('本次核销 ¥1,234.50，剩余 ¥0.00')
    await allocation.scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    expect(errors).toEqual([])
    await page.screenshot({ path: info.outputPath(`${mode}.png`), fullPage: true })
  })
}
