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
    await expect(dialog).toContainText(
      mode === 'payment'
        ? '本笔付款可核销本金 ¥1,234.50，不含手续费'
        : '本笔收款尚有 ¥1,234.50 未核销'
    )
    const summary = dialog.getByRole('alert').filter({ hasText: '可核销 ¥' })
    await expect(summary).toContainText('可核销 ¥1,234.50，本次核销 ¥0.00，剩余 ¥1,234.50')
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
    await expect(summary).toContainText('本次核销 ¥1,234.50，剩余 ¥0.00')
    await allocation.scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    expect(errors).toEqual([])
    await page.screenshot({ path: info.outputPath(`${mode}.png`), fullPage: true })
  })
}

test('付款申请编辑自动分配正金额后尾差归零', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('tms_get_carrier_payment_application_secure'))
      return route.fulfill({
        json: {
          id: 'test-application',
          tenantId: 'test-tenant',
          applicationNo: 'APP-001',
          carrierId: 'test-carrier',
          carrierName: '测试承运商',
          plannedPaymentDate: '2026-10-09',
          amount: 1234.5,
          paymentMethod: 'bank_transfer',
          status: 'draft',
          statementCount: 1,
          statementNos: 'ST-001',
          createTime: '2026-10-09T08:00:00Z',
          updateTime: '2026-10-09T08:00:00Z',
          fieldAccess: { applicationAmounts: 'edit', basisEvidence: 'edit' },
          items: [
            {
              id: 'test-application-item',
              applicationId: 'test-application',
              statementId: 'test-statement',
              carrierId: 'test-carrier',
              statementNoSnapshot: 'ST-001',
              statementAmountSnapshot: 1234.5,
              outstandingAmountSnapshot: 1234.5,
              appliedAmount: 0,
              createTime: '2026-10-09T08:00:00Z',
              updateTime: '2026-10-09T08:00:00Z'
            }
          ]
        }
      })
    if (path.includes('sys_dictionary'))
      return route.fulfill({
        json: [
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
      })
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/cash-allocation-money.html?mode=application', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开付款申请', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '编辑付款申请', exact: true })
  await expect(dialog).toBeVisible()
  const allocation = dialog.locator('.el-table__body-wrapper').getByRole('row').filter({
    hasText: 'ST-001'
  })
  await expect(allocation).toBeVisible()
  await expect(dialog.locator('.el-alert')).toContainText(
    '申请金额 ¥1,234.50，已分配 ¥0.00，待分配 ¥1,234.50'
  )
  await dialog.getByRole('button', { name: '按可申请余额自动分配', exact: true }).click()
  await expect(allocation.getByRole('spinbutton')).toHaveValue('1234.50')
  await expect(dialog.locator('.el-alert')).toContainText(
    '申请金额 ¥1,234.50，已分配 ¥1,234.50，待分配 ¥0.00'
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  expect(errors).toEqual([])
  await page.screenshot({ path: info.outputPath('application.png'), fullPage: true })
})
