import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)

test('运输开单带入发货客户的默认开票账户', async ({ page }, info) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
    process.stderr.write(`页面异常：${error.message}\n`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') process.stderr.write(`浏览器错误：${message.text()}\n`)
  })
  page.on('requestfailed', (request) =>
    process.stderr.write(`请求失败：${request.url()} ${request.failure()?.errorText}\n`)
  )
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'tms_get_order_detail_secure')
      return route.fulfill({
        json: {
          id: '11111111-1111-4111-8111-111111111201',
          tenantId: '11111111-1111-4111-8111-111111111111',
          orderNo: 'QA-ORDER-INVOICE-001',
          orderStatus: 'pending_load',
          originStation: '上海站',
          destinationStation: '苏州站',
          deliveryMethod: 'door',
          shippingCustomerId: '11111111-1111-4111-8111-111111111301',
          shippingCustomer: { customerName: '验收客户甲' },
          shippingContactName: '发货联系人',
          shippingContactPhone: '13800000000',
          shippingAddressDetail: '上海市测试路 1 号',
          receivingContactName: '收货联系人',
          receivingContactPhone: '13900000000',
          receivingAddressDetail: '苏州市测试路 2 号',
          cargoItems: [],
          paymentMethod: 'monthly',
          invoiceAccountId: null,
          orderConfig: {
            loadType: 'ltl',
            billingMode: 'quantity',
            billingUnit: '件',
            cargoCategory: 'general',
            packaging: 'bulk',
            transportRequirements: [],
            attachmentUrls: []
          },
          fieldAccess: {
            shipperContact: 'edit',
            shipperAddress: 'edit',
            receiverContact: 'edit',
            receiverAddress: 'edit',
            freightAmounts: 'edit',
            settlementAmounts: 'edit',
            proofAttachments: 'edit',
            routeCoordinates: 'edit',
            cargoPricing: 'edit'
          }
        }
      })
    if (endpoint === 'tms_list_customer_finances_secure')
      return route.fulfill({
        json: [
          {
            id: '11111111-1111-4111-8111-111111111401',
            customerId: '11111111-1111-4111-8111-111111111301',
            invoiceTitle: '验收客户甲开票主体',
            bankName: '验收银行',
            bankAccount: '6222000000000001',
            isDefaultInvoice: true
          },
          {
            id: '11111111-1111-4111-8111-111111111402',
            customerId: '11111111-1111-4111-8111-111111111301',
            invoiceTitle: '验收客户甲项目分部',
            bankName: '项目银行',
            bankAccount: '6222000000000002',
            isDefaultInvoice: false
          }
        ]
      })
    if (endpoint === 'tms_get_order_contract_summary') return route.fulfill({ json: null })
    return route.fulfill({ json: [] })
  })

  await page.goto('/tests/e2e/fixtures/tms-order-invoice-visual.html', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000
  })
  await expect(page.getByText('开票账户').first()).toBeVisible()
  await expect(page.getByText('验收客户甲开票主体').first()).toBeVisible()
  await page.screenshot({
    path: info.outputPath('order-default-invoice-account.png'),
    fullPage: true
  })
  await page.locator('.el-form-item').filter({ hasText: '开票账户' }).locator('.el-select').click()
  await page.getByText('验收客户甲项目分部').last().click()
  await expect(page.getByText('验收客户甲项目分部').first()).toBeVisible()
  await page.setViewportSize({ width: 1100, height: 760 })
  await expect(page.getByText('已使用前端默认列')).toBeHidden({ timeout: 10_000 })
  await page.screenshot({
    path: info.outputPath('order-project-invoice-account-narrow.png'),
    fullPage: true
  })
  expect(pageErrors).toEqual([])
})
