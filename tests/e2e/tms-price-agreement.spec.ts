import { expect, test } from '@playwright/test'
import { installDictionaryOptions } from './support/dictionary-options'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 20_000 })
test.setTimeout(360_000)
const tenantId = '11111111-1111-4111-8111-111111111111'
const subjectId = '11111111-1111-4111-8111-111111111301'
const contractId = '11111111-1111-4111-8111-111111111601'

for (const kind of ['customer', 'carrier'] as const) {
  test(`${kind}协议价共用配置、合同货物、手改公里数并保存`, async ({ page }, info) => {
    const errors: string[] = []
    const saves: Record<string, unknown>[] = []
    await page.addInitScript(() => {
      Object.assign(window, {
        priceRouteEstimates: 0,
        AMap: {
          Driving: class {
            search(
              _origin: number[],
              _destination: number[],
              callback: (status: string, result: unknown) => void
            ) {
              setTimeout(() => {
                callback('complete', { routes: [{ distance: 123400, time: 7200 }] })
                Reflect.set(
                  window,
                  'priceRouteEstimates',
                  Number(Reflect.get(window, 'priceRouteEstimates')) + 1
                )
              }, 600)
            }
          }
        }
      })
    })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', async (route) => {
      const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
      if (endpoint === `tms_get_${kind}_price_secure`)
        return route.fulfill({
          json: {
            id: '11111111-1111-4111-8111-111111111201',
            tenantId,
            quoteNo: 'QA-PRICE-001',
            customerId: subjectId,
            carrierId: subjectId,
            customer: { id: subjectId, customerName: '验收客户', customerCode: 'QA-CUSTOMER' },
            carrier: { id: subjectId, companyName: '验收承运商', carrierCode: 'QA-CARRIER' },
            contractId,
            contract: {
              id: contractId,
              contractNo: 'QA-CONTRACT-001',
              contractName: '验收运输合同'
            },
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
            shippingLongitude: 121.1,
            shippingLatitude: 31.2,
            receivingLongitude: 120.5,
            receivingLatitude: 31.4,
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
      if (endpoint === `tms_update_${kind}_price_secure`) {
        saves.push(route.request().postDataJSON().p_payload)
        return route.fulfill({ json: { id: '11111111-1111-4111-8111-111111111201' } })
      }
      if (endpoint === 'tms_list_customer_options_secure')
        return route.fulfill({
          json: [{ id: subjectId, customerName: '验收客户', customerCode: 'QA-CUSTOMER', tenantId }]
        })
      if (endpoint === 'tms_list_carrier_options_secure')
        return route.fulfill({
          json: [{ id: subjectId, companyName: '验收承运商', carrierCode: 'QA-CARRIER', tenantId }]
        })
      if (endpoint === 'vms_list_vehicle_type_profiles_secure')
        return route.fulfill({
          json: [
            {
              id: 'profile-1',
              category: '半挂车',
              lengthM: 13,
              volumeM3: 80,
              loadTons: 30,
              sort: 1
            }
          ]
        })
      if (endpoint === 'tms_list_price_contract_details_secure')
        return route.fulfill({
          json: [
            {
              key: 'detail-1',
              contractId,
              contractNo: 'QA-CONTRACT-001',
              contractName: '验收运输合同',
              cargoDescription: '验收货物',
              cargoCode: 'QA-GOODS',
              unit: 'box',
              contractQuantity: 10,
              transportUnitPrice: 25
            }
          ]
        })
      if (endpoint === 'get_table_column_runtime')
        return route.fulfill({ json: { enabled: false, profiles: [] } })
      if (endpoint === 'material_unit_compatibility_options')
        return route.fulfill({
          json: [
            {
              id: 'unit-kg',
              code: 'kg',
              value: 'kg',
              label: '千克',
              status: '1',
              sort: 1,
              dictTypeTable: { code: 'tmsCargoUnit', name: '计量单位' }
            },
            {
              id: 'unit-box',
              code: 'box',
              value: 'box',
              label: '箱',
              status: '1',
              sort: 2,
              dictTypeTable: { code: 'tmsCargoUnit', name: '计量单位' }
            }
          ]
        })
      return route.fulfill({ json: [] })
    })
    await installDictionaryOptions(page, {
      commonBoolean: [
        { value: 'false', label: '否' },
        { value: 'true', label: '是' }
      ],
      tmsPriceAgreementStatus: [
        { value: 'draft', label: '草稿' },
        { value: 'pending', label: '待审批' },
        { value: 'effective', label: '已生效' },
        { value: 'expired', label: '已失效' }
      ],
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
    await page.goto(`/tests/e2e/fixtures/tms-price-agreement.html?kind=${kind}`, {
      waitUntil: 'commit'
    })
    await expect(page.locator(`.${kind}-price-edit`)).toBeVisible({ timeout: 300_000 })
    await expect(page.getByText('预估公里数', { exact: true })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('textbox', { name: '关联合同', exact: true })).toHaveValue(
      '验收运输合同',
      { timeout: 180_000 }
    )
    await expect(page.locator('form form')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '13 米', exact: true })).toBeVisible()
    const km = page
      .locator('.el-form-item')
      .filter({ has: page.getByText('预估公里数', { exact: true }) })
      .getByRole('spinbutton')
    await page.getByRole('button', { name: '重新计算公里数', exact: true }).click()
    await expect(km).toHaveValue('123.40')
    await page.getByRole('button', { name: '重新计算公里数', exact: true }).click()
    await km.fill('99.5')
    await km.blur()
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'priceRouteEstimates'))).toBe(2)
    await expect(km).toHaveValue('99.50')
    const contractButton = page.getByRole('button', { name: '批量选合同明细', exact: true })
    await contractButton.scrollIntoViewIfNeeded()
    const layout = await contractButton.evaluate((button) => {
      const ancestors = []
      for (let node: HTMLElement | null = button; node; node = node.parentElement) {
        const rect = node.getBoundingClientRect()
        const css = getComputedStyle(node)
        ancestors.push({
          className: node.className,
          x: rect.x,
          width: rect.width,
          display: css.display,
          minWidth: css.minWidth,
          grid: css.gridTemplateColumns
        })
      }
      return { viewport: innerWidth, ancestors }
    })
    expect(
      layout.ancestors[0].x + layout.ancestors[0].width,
      JSON.stringify(layout)
    ).toBeLessThanOrEqual(layout.viewport)
    await contractButton.click()
    const picker = page.getByRole('dialog').filter({ hasText: '批量选择合同明细' })
    await expect(picker.getByText('验收货物', { exact: true }).first()).toBeVisible()
    await picker.locator('tbody tr').first().click()
    await picker.getByRole('button', { name: '确定', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '货物名称', exact: true })).toHaveValue(
      '验收货物'
    )
    await page.getByRole('spinbutton', { name: '数量', exact: true }).fill('2')
    await page.getByRole('spinbutton', { name: '数量', exact: true }).blur()
    await expect(page.getByRole('spinbutton', { name: '数量', exact: true })).toBeInViewport({
      ratio: 1
    })
    await expect(page.getByText('QA-GOODS', { exact: true }).first()).toBeVisible()
    await page.screenshot({ path: info.outputPath(`${kind}-agreement-1440.png`), fullPage: true })
    await page.setViewportSize({ width: 1280, height: 800 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)).toBe(
      false
    )
    await page.screenshot({ path: info.outputPath(`${kind}-agreement-1280.png`), fullPage: true })
    await page
      .getByRole('button', {
        name: `保存${kind === 'customer' ? '客户' : '承运商'}协议价`,
        exact: true
      })
      .click()
    expect(errors).toEqual([])
    await expect.poll(() => saves.length).toBe(1)
    expect(saves[0].distance_km).toBe(99.5)
    expect(saves[0].contract_id).toBe(contractId)
    expect(saves[0].billing_method).toBe('by_weight')
    expect(saves[0].cargo_items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cargo_code: 'QA-GOODS', quantity: 2, freight: 50 })
      ])
    )
    expect(errors).toEqual([])
  })
}
