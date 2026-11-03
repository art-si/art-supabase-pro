import { expect, test } from '@playwright/test'
import { installDictionaryOptions } from './support/dictionary-options'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 20_000 })
test.setTimeout(300_000)

for (const kind of ['customer', 'carrier'] as const) {
  test(`${kind}协议价列表与详情显示合同、状态、有效期、里程和货物来源`, async ({ page }) => {
    const title = kind === 'customer' ? '客户协议价' : '承运商协议价'
    const record = {
      id: '11111111-1111-4111-8111-111111111201',
      tenantId: '11111111-1111-4111-8111-111111111111',
      quoteNo: 'QA-PRICE-001',
      customerId: 'customer-1',
      carrierId: 'carrier-1',
      customer: { id: 'customer-1', customerName: '验收客户', customerCode: 'QA-CUSTOMER' },
      carrier: { id: 'carrier-1', companyName: '验收承运商', carrierCode: 'QA-CARRIER' },
      contractId: 'contract-1',
      contract: { id: 'contract-1', contractNo: 'QA-CONTRACT-001', contractName: '验收运输合同' },
      agreementStatus: 'effective',
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-12-31',
      distanceKm: 88.5,
      originRegion: '上海市/上海市/嘉定区',
      destinationRegion: '江苏省/苏州市/昆山市',
      transportType: 'truckload',
      transportMode: 'road',
      billingMethod: 'by_weight',
      cargoType: 'general',
      totalFee: 120,
      cargoItems: [
        {
          cargoName: '验收货物',
          cargoCode: 'QA-GOODS',
          specModel: '箱装 A1',
          quantity: 2,
          unit: 'box',
          unitPrice: 25,
          freight: 50,
          sourceContractName: '验收运输合同',
          sourceContractNo: 'QA-CONTRACT-001'
        }
      ],
      fieldAccess: { quoteAmounts: 'read', costAmounts: 'read', paymentAmounts: 'read' }
    }
    await page.route('**/rest/v1/**', (route) => {
      const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
      if (endpoint === `tms_list_${kind}_prices_secure`)
        return route.fulfill({
          json: { records: [record], total: 1, fieldAccess: record.fieldAccess }
        })
      if (endpoint === `tms_get_${kind}_price_secure`) return route.fulfill({ json: record })
      if (endpoint === 'get_table_column_runtime')
        return route.fulfill({ json: { enabled: false, profiles: [] } })
      return route.fulfill({ json: [] })
    })
    await installDictionaryOptions(page, {
      tmsPriceAgreementStatus: [
        { value: 'draft', label: '草稿' },
        { value: 'effective', label: '已生效' }
      ],
      tmsCustomerPriceTransportType: [{ value: 'truckload', label: '整车' }],
      tmsCarrierPriceTransportMode: [{ value: 'road', label: '公路运输' }],
      tmsCustomerPriceBillingMethod: [{ value: 'by_weight', label: '按重量' }],
      tmsCustomerPriceCargoType: [{ value: 'general', label: '普通货物' }],
      tmsCargoUnit: [{ value: 'box', label: '箱' }]
    })
    await page.goto(`/tests/e2e/fixtures/tms-price-readonly.html?kind=${kind}`, {
      waitUntil: 'commit'
    })
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 180_000 })
    for (const column of ['关联合同名称', '关联合同编号', '协议状态', '有效期', '线路里程'])
      await expect(page.getByRole('columnheader', { name: column })).toBeVisible()
    await expect(page.getByText('验收运输合同', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('QA-CONTRACT-001', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('已生效', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('88.5 km', { exact: true }).first()).toBeVisible()
    await page
      .getByRole('button', { name: kind === 'customer' ? '验收客户' : 'QA-PRICE-001' })
      .click()
    await expect(page.locator('.rate-card-detail')).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText('关联合同名称', { exact: true })).toBeVisible()
    await expect(page.getByText('QA-CONTRACT-001', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('已生效', { exact: true })).toBeVisible()
    for (const column of ['货物编码', '规格型号', '来源合同', '协议单价（元）', '货物运费（元）'])
      await expect(page.getByRole('columnheader', { name: column })).toBeVisible()
    await expect(page.getByText('QA-GOODS', { exact: true })).toBeVisible()
    await expect(page.getByText('箱装 A1', { exact: true })).toBeVisible()
  })
}
