import { expect, test } from '@playwright/test'
import {
  openTransportEntry as open,
  transportInput as input,
  type TransportWrite as Write
} from './support/form-standard-transport'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 25_000 })
test.setTimeout(90_000)
const referenceId = '33333333-3333-4333-8333-333333333333'
const tenantId = '11111111-1111-4111-8111-111111111111'
const cases = [
  {
    entry: 'carrier-restricted',
    tabs: 2,
    path: 'tms_update_carrier_multi_secure',
    key: 'companyName',
    value: '验收承运商'
  },
  {
    entry: 'customer-restricted',
    tabs: 2,
    path: 'tms_update_customer_secure',
    key: 'customerName',
    value: '验收客户'
  },
  { entry: 'cargo', tabs: 2, path: 'mdm_cargo', value: '验收货物' },
  {
    entry: 'carrier',
    tabs: 3,
    path: 'tms_update_carrier_multi_secure',
    key: 'companyName',
    value: '验收承运商'
  },
  {
    entry: 'customer',
    tabs: 3,
    path: 'tms_update_customer_secure',
    key: 'customerName',
    value: '验收客户'
  },
  { entry: 'service', tabs: 2, path: 'tms_service_case', key: 'title', value: '验收服务咨询' },
  { entry: 'station', tabs: 0, path: 'save_tms_station', key: 'stationName', value: '验收站点' },
  {
    entry: 'supplier',
    tabs: 0,
    path: 'vms_update_vehicle_supplier_secure',
    key: 'supplierName',
    value: '验收车辆供应商'
  },
  {
    entry: 'insurance',
    tabs: 0,
    path: 'mdm_insurance_company',
    key: 'companyName',
    value: '验收保险公司'
  },
  {
    entry: 'parts-category',
    tabs: 0,
    path: 'mdm_part_category',
    key: 'categoryName',
    value: '验收零件类别'
  },
  { entry: 'parts', tabs: 3, path: 'mdm_part', key: 'partName', value: '验收零部件' },
  {
    entry: 'trailer',
    tabs: 3,
    path: 'vms_save_trailer_secure',
    key: 'plateNo',
    value: '测A1234挂'
  },
  {
    entry: 'accident',
    tabs: 3,
    path: 'vms_update_vehicle_accident_secure',
    key: 'accidentSummary',
    value: '验收事故记录'
  },
  {
    entry: 'maintenance',
    tabs: 4,
    path: 'vms_update_vehicle_maintenance_secure',
    value: '验收维修项目'
  },
  {
    entry: 'routine',
    tabs: 2,
    path: 'vms_update_vehicle_routine_inspection_secure',
    key: 'inspector',
    value: '验收检查人'
  },
  {
    entry: 'routine-compact',
    tabs: 0,
    path: 'vms_update_vehicle_routine_inspection_secure',
    key: 'inspector',
    value: '验收检查人'
  },
  {
    entry: 'vehicle-insurance',
    tabs: 3,
    path: 'vms_update_vehicle_insurance_secure',
    key: 'commercialPolicyNo',
    value: 'COMMERCIAL-TEST'
  },
  {
    entry: 'part-usage',
    tabs: 2,
    path: 'vms_update_vehicle_part_usage_secure',
    value: '验收车辆零件'
  },
  {
    entry: 'favorite-route',
    tabs: 0,
    path: 'tms_favorite_route',
    key: 'routeName',
    value: '验收常用线路'
  },
  {
    entry: 'agreement',
    tabs: 3,
    path: 'tms_transport_agreement',
    key: 'shipperName',
    value: '验收托运方'
  },
  {
    entry: 'contract',
    tabs: 5,
    path: 'tms_update_contract_secure',
    key: 'contractName',
    value: '验收运输合同'
  },
  { entry: 'quote', tabs: 2, path: 'tms_save_order_quote_secure', value: '50' },
  {
    entry: 'fuel-recharge',
    tabs: 0,
    path: 'vms_record_fuel_card_transaction_v4',
    key: 'amount',
    value: '100'
  },
  {
    entry: 'fuel-consume',
    tabs: 2,
    path: 'vms_record_fuel_card_transaction_v4',
    key: 'amount',
    value: '100'
  },
  {
    entry: 'electric-recharge',
    tabs: 0,
    path: 'vms_record_electric_card_transaction_v2',
    key: 'amount',
    value: '100'
  },
  {
    entry: 'electric-consume',
    tabs: 2,
    path: 'vms_record_electric_card_transaction_v2',
    key: 'amount',
    value: '100'
  }
]
for (const item of cases) {
  test(`${item.entry} 真实校验修正并跨页签保存`, async ({ page }, info) => {
    const errors: string[] = []
    const writes: Write[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const dialog = await open(page, item.entry, writes)
    const navigation = dialog.locator('.art-form').getByRole('tab')
    await expect(navigation).toHaveCount(item.tabs)
    const confirm =
      item.entry === 'contract'
        ? dialog.getByRole('button', { name: '保存', exact: true })
        : item.entry === 'quote'
          ? dialog.getByRole('button', { name: '保存报价', exact: true })
          : dialog.locator('.art-dialog__footer-actions button').last()
    if (item.key) {
      const target = input(dialog, item.key)
      await target.fill('')
      if (item.tabs) await navigation.last().click()
      await confirm.click()
      await expect(
        dialog.locator(`[data-art-form-item-key="${item.key}"] .el-form-item`)
      ).toHaveClass(/is-error/)
      await expect(target).toBeVisible()
      expect(writes).toEqual([])
      await target.fill(item.value)
    }
    if (item.tabs) await navigation.last().click()
    if (item.entry === 'electric-consume') {
      await input(dialog, 'chargeKwh').fill('10')
      await input(dialog, 'unitPrice').fill('10')
    }
    await confirm.click()
    await expect(page.getByTestId('save-result')).toHaveText('已保存')
    await expect(dialog).toBeHidden()
    expect(writes).toHaveLength(1)
    expect(writes[0].path).toBe(item.path)
    if (item.entry === 'cargo')
      expect(writes[0].payload).toMatchObject({
        material_id: referenceId,
        weight_kg: 10,
        tenant_id: tenantId
      })
    else expect(JSON.stringify(writes[0].payload)).toContain(item.value)
    expect(errors).toEqual([])
    await page.screenshot({ path: info.outputPath('saved.png'), timeout: 60_000 })
  })
  for (const visual of [
    { width: 1440, height: 900, theme: 'light' },
    { width: 390, height: 844, theme: 'dark' }
  ]) {
    test(`${item.entry} ${visual.theme}${visual.width} 全内容视觉`, async ({ page }, info) => {
      await page.setViewportSize(visual)
      const dialog = await open(page, item.entry, [], `&theme=${visual.theme}`)
      const nav = dialog.locator('.art-form').getByRole('tab')
      await expect(nav).toHaveCount(item.tabs)
      const count = await nav.count()
      for (let index = 0; index < Math.max(1, count); index++) {
        if (count) await nav.nth(index).click()
        expect(
          await dialog.evaluate((element) => element.scrollWidth > element.clientWidth + 1)
        ).toBe(false)
        await dialog.screenshot({
          path: info.outputPath(`pane-${index + 1}.png`),
          timeout: 60_000,
          animations: 'disabled'
        })
      }
    })
  }
}
