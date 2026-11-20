import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { installDictionaryOptions } from './support/dictionary-options'
import { expectFormCardShadow } from './support/form-card-shadow'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const subjectId = '11111111-1111-4111-8111-111111111301'
const contractId = '11111111-1111-4111-8111-111111111601'

async function mockReadonlyReferences(page: Page, priceKind?: 'customer' | 'carrier') {
  const unexpectedWrites: string[] = []
  const unexpectedReads: string[] = []
  const pageErrors: string[] = []
  const safeTables = [
    'sys_param',
    'sys_dictionary',
    'sys_user',
    'sys_tenant',
    'sys_menu',
    'sys_document_number_rule',
    'mdm_project',
    'mdm_customer',
    'mdm_supplier',
    'mdm_material',
    'mdm_material_category',
    'mdm_material_type',
    'mdm_material_code_rule',
    'mdm_unit_of_measure',
    'mdm_document_type',
    'mdm_warehouse',
    'mdm_warehouse_zone',
    'mdm_warehouse_bin',
    'mdm_project_construction',
    'mdm_organization',
    'scm_quote_expense',
    'scm_purchase_document',
    'scm_sales_document'
  ]
  const safeReadRpcs = [
    'tms_list_customer_options_secure',
    'tms_list_carrier_options_secure',
    'vms_list_vehicle_type_profiles_secure',
    'tms_list_price_contract_details_secure',
    'material_unit_compatibility_options',
    'tms_list_customer_addresses_secure',
    'get_organization_list_secure',
    'scm_purchase_suppliers_secure'
  ]
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const endpoint = url.pathname.split('/').at(-1) ?? ''
    if (endpoint === 'current_is_super') return route.fulfill({ json: false })
    if (endpoint === 'get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    if (priceKind && endpoint === `tms_get_${priceKind}_price_secure`) {
      return route.fulfill({
        json: {
          id: '11111111-1111-4111-8111-111111111201',
          tenantId,
          quoteNo: 'QA-SHADOW-PRICE',
          customerId: subjectId,
          carrierId: subjectId,
          customer: { id: subjectId, customerName: '阴影验收客户', customerCode: 'QA-CUSTOMER' },
          carrier: { id: subjectId, companyName: '阴影验收承运商', carrierCode: 'QA-CARRIER' },
          contractId,
          contract: { id: contractId, contractNo: 'QA-CONTRACT', contractName: '阴影验收合同' },
          originRegion: '上海市/上海市/嘉定区',
          destinationRegion: '江苏省/苏州市/昆山市',
          transportType: 'truckload',
          transportMode: 'road',
          shippingContactName: '验收发货人',
          receivingContactName: '验收收货人',
          shippingContactPhone: '13800000001',
          receivingContactPhone: '13800000002',
          shippingAddressDetail: '验收发货地址',
          receivingAddressDetail: '验收收货地址',
          distanceKm: 88.5,
          agreementStatus: 'draft',
          effectiveFrom: '2026-01-01',
          effectiveTo: '2026-12-31',
          billingMethod: 'by_weight',
          orderConfig: {
            loadType: 'ftl',
            vehicleType: '半挂车',
            vehicleLengthM: 13,
            vehicleVolumeM3: 80,
            vehicleLoadTons: 30,
            truckCount: 1,
            billingMode: 'weight',
            billingUnit: 'kg',
            cargoCategory: 'general',
            packaging: 'bulk',
            selfPickup: false,
            insured: false,
            allowConsolidation: false,
            transportRequirements: [],
            trackingMethod: '',
            trackingNumber: '',
            remark: '',
            attachmentUrls: []
          },
          cargoItems: [],
          transportFee: 100,
          transportCost: 100,
          fieldAccess: {
            contactPhones: 'edit',
            addressDetails: 'edit',
            quoteAmounts: 'edit',
            costAmounts: 'edit',
            paymentAmounts: 'edit'
          }
        }
      })
    }
    if (endpoint === 'tms_list_customer_options_secure')
      return route.fulfill({
        json: [
          { id: subjectId, customerName: '阴影验收客户', customerCode: 'QA-CUSTOMER', tenantId }
        ]
      })
    if (endpoint === 'tms_list_carrier_options_secure')
      return route.fulfill({
        json: [
          { id: subjectId, companyName: '阴影验收承运商', carrierCode: 'QA-CARRIER', tenantId }
        ]
      })
    if (endpoint === 'vms_list_vehicle_type_profiles_secure')
      return route.fulfill({
        json: [
          { id: 'profile-1', category: '半挂车', lengthM: 13, volumeM3: 80, loadTons: 30, sort: 1 }
        ]
      })
    if (endpoint === 'tms_list_customer_addresses_secure')
      return route.fulfill({ json: { records: [], total: 0 } })
    if (safeReadRpcs.includes(endpoint)) return route.fulfill({ json: [] })
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      unexpectedWrites.push(`${request.method()} ${url.pathname}`)
      return route.fulfill({
        status: 403,
        json: { code: '42501', message: '阴影验收禁止业务写入' }
      })
    }
    if (!safeTables.includes(endpoint)) unexpectedReads.push(url.pathname)
    return route.fulfill({
      json: [],
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
    })
  })
  await installDictionaryOptions(page, {
    commonBoolean: [
      { value: 'false', label: '否' },
      { value: 'true', label: '是' }
    ],
    scmTaxRate: [
      { value: '0', label: '0%' },
      { value: '13', label: '13%' }
    ],
    scmDiscountMode: [{ value: 'none', label: '不折扣' }],
    scmPaymentPlanMode: [{ value: 'amount', label: '按金额' }],
    scmPaymentType: [{ value: 'bank', label: '银行转账' }],
    mdmCurrency: [{ value: 'CNY', label: '人民币' }],
    tmsPriceAgreementStatus: [{ value: 'draft', label: '草稿' }],
    tmsOrderLoadType: [
      { value: 'ltl', label: '零担' },
      { value: 'ftl', label: '整车' }
    ],
    tmsOrderBillingMode: [
      { value: 'weight', label: '按重量' },
      { value: 'volume', label: '按体积' },
      { value: 'quantity', label: '按数量' }
    ],
    tmsOrderCargoCategory: [{ value: 'general', label: '普通货物' }],
    tmsOrderPackaging: [{ value: 'bulk', label: '散装' }],
    tmsCargoUnit: [
      { value: 'box', label: '箱' },
      { value: 'kg', label: '千克' }
    ],
    tmsCarrierPriceTransportMode: [{ value: 'road', label: '公路运输' }]
  })
  return { unexpectedWrites, unexpectedReads, pageErrors }
}

for (const theme of ['light', 'dark'] as const) {
  for (const kind of ['purchase-order', 'sales-quotation'] as const) {
    test(`${kind}非合同表头卡片保留完整${theme}阴影`, async ({ page }, info) => {
      const appearance = { theme, boxBorderMode: false }
      const ownTenantId = kind === 'purchase-order' ? tenantId : 'tenant-a'
      await prepareIsolatedSession(page, { tenantId: ownTenantId, platformSuper: false })
      await prepareAppearance(page, appearance)
      const state = await mockReadonlyReferences(page)
      await page.goto(
        kind === 'purchase-order'
          ? '/tests/e2e/fixtures/scm-purchase-inbound.html?view=price&shadowAudit=1'
          : '/tests/e2e/fixtures/quotation-conversion.html?quotationTenant=tenant-a&shadowAudit=1',
        { waitUntil: 'domcontentloaded' }
      )
      await page
        .getByRole('button', {
          name: kind === 'purchase-order' ? '打开测试采购订单' : '编辑报价',
          exact: true
        })
        .click()
      const dialog = page
        .getByRole('dialog')
        .filter({ has: page.getByText('单据基本信息', { exact: true }) })
      await expect(dialog).toBeVisible()
      await assertAppearance(page, appearance)
      await expect(dialog.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'false')
      await expect(dialog.getByText('正在加载…', { exact: true })).toHaveCount(0)
      const card = dialog
        .locator('.art-section-card')
        .filter({ has: page.getByText('单据基本信息', { exact: true }) })
        .first()
      await expectFormCardShadow(page, card, info, `${kind}-${theme}`)
      await dialog.screenshot({ path: info.outputPath(`${kind}-${theme}-shadow.png`) })
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      await expect(dialog).toBeHidden()
      expect(state.unexpectedWrites).toEqual([])
      expect(state.unexpectedReads).toEqual([])
      expect(state.pageErrors).toEqual([])
    })
  }

  for (const kind of ['customer', 'carrier'] as const) {
    test(`${kind}协议价表单卡片保留完整${theme}阴影`, async ({ page }, info) => {
      const appearance = { theme, boxBorderMode: false }
      await prepareIsolatedSession(page, { tenantId, platformSuper: false })
      await prepareAppearance(page, appearance)
      const state = await mockReadonlyReferences(page, kind)
      await page.goto(`/tests/e2e/fixtures/tms-price-agreement.html?kind=${kind}&shadowAudit=1`, {
        waitUntil: 'domcontentloaded'
      })
      const root = page.locator(`.${kind}-price-edit`)
      await expect(root).toBeVisible()
      await expect(root.getByRole('textbox', { name: '关联合同', exact: true })).toHaveValue(
        '阴影验收合同'
      )
      await expect(root.getByText('正在加载…', { exact: true })).toHaveCount(0)
      await assertAppearance(page, appearance)
      await expectFormCardShadow(
        page,
        root.locator(`.${kind}-price-edit__section`).first(),
        info,
        `${kind}-agreement-${theme}`
      )
      await page.screenshot({ path: info.outputPath(`${kind}-${theme}-first-card.png`) })
      await root.locator(`.${kind}-price-edit__footer`).evaluate((element) => {
        for (let node = element.parentElement; node; node = node.parentElement) {
          if (['auto', 'scroll'].includes(getComputedStyle(node).overflowY))
            node.scrollTop = node.scrollHeight
        }
        if (document.scrollingElement)
          document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight
      })
      await page.screenshot({ path: info.outputPath(`${kind}-${theme}-last-card.png`) })
      expect(state.unexpectedWrites).toEqual([])
      expect(state.unexpectedReads).toEqual([])
      expect(state.pageErrors).toEqual([])
    })
  }
}
