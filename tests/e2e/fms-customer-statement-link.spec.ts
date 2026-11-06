import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

const recordId = '11111111-1111-4111-8111-111111111901'
const customerId = '11111111-1111-4111-8111-111111111902'
const statement = {
  id: recordId,
  tenantId: '11111111-1111-4111-8111-111111111111',
  customerId,
  customerName: '验收客户',
  statementNo: 'DZ-TEST-01',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-30',
  waybillCount: 2,
  status: 'draft',
  statementAmount: 100,
  settledAmount: 0,
  outstandingAmount: 100,
  fieldAccess: { statementAmounts: 'read', settlementAmounts: 'read' },
  items: []
}

test('客户对账链接按客户及单据定位，并直接打开详情；无查看权限不自动打开', async ({ page }) => {
  test.slow()
  const listRequests: Array<Record<string, unknown>> = []
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const body = route.request().postDataJSON() as Record<string, unknown> | null
    if (name === 'tms_list_customer_statements_secure') {
      if (body) listRequests.push(body)
      return route.fulfill({
        json: { records: [statement], total: 1, fieldAccess: statement.fieldAccess }
      })
    }
    if (name === 'tms_get_customer_statement_secure') return route.fulfill({ json: statement })
    if (name === 'get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    return route.fulfill({ json: [] })
  })

  await page.goto('/tests/e2e/fixtures/fms-customer-statement-link.html', {
    waitUntil: 'domcontentloaded'
  })
  await expect
    .poll(() => listRequests.at(-1))
    .toMatchObject({
      p_customer_id: customerId,
      p_record_id: recordId
    })
  await expect(page.getByText('客户对账详情', { exact: true })).toBeVisible()
  await expect(page.getByText('DZ-TEST-01', { exact: true }).last()).toBeVisible()

  await page.goto('/tests/e2e/fixtures/fms-customer-statement-link.html?denied', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByText('客户对账详情', { exact: true })).toHaveCount(0)
})
