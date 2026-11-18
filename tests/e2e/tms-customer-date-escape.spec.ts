import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('客户协议价日期面板先处理 Escape，随后才能关闭客户弹窗', async ({ page }) => {
  test.setTimeout(120_000)
  const customer = {
    id: '11111111-1111-4111-8111-111111111112',
    tenantId: '11111111-1111-4111-8111-111111111111',
    customerCode: 'KH-DATE-ESC',
    customerName: '测试日期键盘客户',
    enabled: true,
    tags: [],
    fieldAccess: {}
  }
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'tms_list_customers_secure') {
      return route.fulfill({ json: { records: [customer], total: 1, fieldAccess: {} } })
    }
    if (endpoint === 'get_table_column_runtime') {
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    }
    if (endpoint === 'tms_list_customer_prices_secure') {
      return route.fulfill({ json: { records: [], total: 0, fieldAccess: {} } })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/tms-customer-workspace.html', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  })
  await page.getByText(customer.customerName, { exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: '编辑客户', exact: true })
  await dialog.getByRole('tab', { name: '客户协议价', exact: true }).click()
  const filters = dialog.locator('.art-search-bar:visible')
  await filters.getByRole('button', { name: '展开', exact: true }).press('Enter')
  const start = filters.getByPlaceholder('开始日期', { exact: true })
  const end = filters.getByPlaceholder('结束日期', { exact: true })
  const calendar = page.locator('.el-date-range-picker:visible')

  await start.focus()
  await start.press('Tab')
  await expect(end).toBeFocused()
  await expect(end).toHaveAttribute('aria-expanded', 'true')
  await expect(calendar).toBeVisible()

  await end.press('Escape')
  await expect(calendar).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(end).toBeFocused()
  await expect(end).toHaveAttribute('aria-expanded', 'false')

  await end.press('Escape')
  await expect(dialog).toBeHidden()
})
