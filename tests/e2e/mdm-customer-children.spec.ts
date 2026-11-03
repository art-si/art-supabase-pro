import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)

test('MDM 客户页使用同一联系人与财务子表', async ({ page }, info) => {
  const errors: string[] = []
  const requestedChildren: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') process.stderr.write(`浏览器错误：${message.text()}\n`)
  })
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'tms_list_customer_contacts_secure') {
      requestedChildren.push('contact')
      return route.fulfill({
        json: [
          {
            id: '11111111-1111-4111-8111-111111111301',
            customerId: '11111111-1111-4111-8111-111111111201',
            name: '验收联系人甲',
            mobile: '13800000000',
            isDefault: true,
            role: '商务'
          }
        ]
      })
    }
    if (endpoint === 'tms_list_customer_finances_secure') {
      requestedChildren.push('finance')
      return route.fulfill({
        json: [
          {
            id: '11111111-1111-4111-8111-111111111401',
            customerId: '11111111-1111-4111-8111-111111111201',
            invoiceTitle: '验收客户甲开票主体',
            taxNo: '91310000TEST000001',
            bankName: '验收银行',
            bankAccount: '6222000000000001',
            bankBranch: '上海支行',
            isDefaultInvoice: true,
            fieldAccess: { taxNo: 'edit', bankAccount: 'edit' }
          }
        ]
      })
    }
    return route.fulfill({ json: [] })
  })

  await page.goto('/tests/e2e/fixtures/mdm-customer-children.html', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000
  })
  await page.getByRole('button', { name: '编辑验收客户' }).click()
  await expect(page.getByRole('tab', { name: '客户主档' })).toBeVisible()
  expect(requestedChildren).toEqual([])
  await page.getByRole('tab', { name: '联系人' }).click()
  await expect(page.getByText('验收联系人甲').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '新增联系人' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('mdm-customer-contacts.png'), fullPage: true })

  await page.getByRole('tab', { name: '财务信息' }).click()
  await expect(page.getByText('验收客户甲开票主体').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '新增财务账户' })).toBeVisible()
  await page.setViewportSize({ width: 1100, height: 760 })
  await page.screenshot({
    path: info.outputPath('mdm-customer-finance-narrow.png'),
    fullPage: true
  })
  expect(requestedChildren).toEqual(['contact', 'finance'])
  expect(errors).toEqual([])
})
