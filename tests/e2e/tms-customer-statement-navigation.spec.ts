import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.slow()

test('客户对账页签无法进入财务应用时给出明确反馈', async ({ page }) => {
  const customer = {
    id: '11111111-1111-4111-8111-111111111912',
    tenantId: '11111111-1111-4111-8111-111111111111',
    customerCode: 'KH-NAV-01',
    customerName: '导航验收客户',
    enabled: true,
    tags: [],
    fieldAccess: {},
    isRecordOwner: true
  }
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'tms_list_customers_secure')
      return route.fulfill({ json: { records: [customer], total: 1, fieldAccess: {} } })
    if (name === 'tms_list_customer_statements_secure')
      return route.fulfill({
        json: {
          records: [
            {
              id: '11111111-1111-4111-8111-111111111911',
              customerId: customer.id,
              statementNo: 'DZ-NAV-01',
              periodStart: '2026-11-01',
              periodEnd: '2026-11-30',
              status: 'draft',
              waybillCount: 2
            }
          ],
          total: 1,
          fieldAccess: {}
        }
      })
    if (name === 'get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    return route.fulfill({ json: [] })
  })

  await page.goto('/tests/e2e/fixtures/tms-customer-workspace.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByText(customer.customerName, { exact: true }).first().click()
  const dialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('tab', { name: '客户识别' }) })
  await dialog.getByRole('tab', { name: '客户对账', exact: true }).click()
  await expect(dialog.getByText('DZ-NAV-01', { exact: true })).toBeVisible()
  await dialog
    .locator('[data-art-form-tab="statementsSection"]')
    .getByRole('button', { name: '查看' })
    .click()
  await expect(page.getByText('当前账号没有目标应用的访问权限')).toBeVisible()
})
