import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('合同客户和承运商复用名称编码展示', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('tms_list_customer_options_secure'))
      return route.fulfill({
        json: [
          { id: 'customer-a', customer_name: '测试客户', customer_code: 'CUS-001' },
          { id: 'customer-b', customer_name: '未编码客户', customer_code: null }
        ]
      })
    if (path.endsWith('tms_list_carrier_options_secure'))
      return route.fulfill({
        json: [{ id: 'carrier-a', company_name: '测试承运商', carrier_code: 'CAR-001' }]
      })
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/contract-option-reuse.html')
  await page.getByRole('button', { name: '打开合同验收' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const customer = dialog.locator('.el-form-item').filter({ hasText: '客户/货主' })
  await customer.getByRole('combobox').click()
  await expect(page.getByRole('option', { name: '测试客户（CUS-001）', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: '未编码客户', exact: true })).toBeVisible()
  await page.getByRole('option', { name: '测试客户（CUS-001）', exact: true }).click()
  await expect(customer).toContainText('测试客户（CUS-001）')
  await dialog.getByText('企业/货主端合同', { exact: true }).click()
  const carrier = dialog.locator('.el-form-item').filter({
    has: page.locator('.el-form-item__label').filter({ hasText: /^承运商$/ })
  })
  await carrier.getByRole('combobox').click()
  await expect(
    page.getByRole('option', { name: '测试承运商（CAR-001）', exact: true })
  ).toBeVisible()
  await page.getByRole('option', { name: '测试承运商（CAR-001）', exact: true }).click()
  await expect(carrier).toContainText('测试承运商（CAR-001）')
  await carrier.scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('contract-option.png'), fullPage: true })
  expect(errors).toEqual([])
})
