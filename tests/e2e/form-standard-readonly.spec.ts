import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { readonlyPurchase, readonlySales } from './fixtures/form-standard-readonly-data'
import { formStandardTransportDictionaries } from './fixtures/form-standard-transport-dictionaries'
import {
  nativeService,
  nativeElectronic,
  nativeAgreement,
  ledgerDetail
} from './fixtures/form-standard-native-detail-data'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 25_000 })
test.setTimeout(90_000)
const cases = [
  { entry: 'business-detail', tabs: 2, text: '验收业务类型' },
  { entry: 'document-detail', tabs: 0, text: '验收单据类型' },
  { entry: 'document-detail-production', tabs: 2, text: '验收单据类型' },
  { entry: 'document-detail-production-many', tabs: 3, text: '验收单据类型' },
  { entry: 'document-detail-payable', tabs: 0, text: '验收单据类型' },
  { entry: 'catalog-detail', tabs: 2, text: '验收主数据' },
  { entry: 'catalog-detail-compact', tabs: 0, text: '验收主数据' },
  { entry: 'bom-detail', tabs: 3, text: '验收BOM物料' },
  { entry: 'movement-detail', tabs: 0, text: '验收入库' },
  { entry: 'expense-detail', tabs: 0, text: '验收费用' },
  { entry: 'category-detail', tabs: 2, text: '验收报价项' },
  { entry: 'category-detail-compact', tabs: 0, text: '验收报价项' },
  { entry: 'purchase-detail', tabs: 4, text: 'PURCHASE-TEST' },
  { entry: 'sales-detail', tabs: 4, text: 'SALES-TEST' },
  { entry: 'equipment-detail', tabs: 2, text: '验收生产设备' },
  { entry: 'native-service', tabs: 2, text: 'SERVICE-READONLY' },
  { entry: 'native-electronic', tabs: 3, text: 'ELECTRONIC-READONLY' },
  { entry: 'native-agreement', tabs: 3, text: 'AGREEMENT-READONLY' },
  { entry: 'native-fuel-consume', tabs: 2, text: 'CARD-TEST · 测A12345' },
  { entry: 'native-fuel-recharge', tabs: 0, text: 'CARD-TEST · 测A12345' },
  { entry: 'native-electric-consume', tabs: 2, text: 'CARD-TEST · 测A12345' },
  { entry: 'native-electric-recharge', tabs: 0, text: 'CARD-TEST · 测A12345' }
]
for (const item of cases) {
  for (const visual of [
    { width: 1440, height: 900, theme: 'light' },
    { width: 390, height: 844, theme: 'dark' }
  ]) {
    test(`${item.entry} ${visual.theme}${visual.width} 只读分类与全部内容`, async ({
      page
    }, info) => {
      const unexpected: string[] = []
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.setViewportSize(visual)
      await prepareIsolatedSession(page)
      await page.route('**/rest/v1/**', (route) => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (path.endsWith('/sys_dictionary')) {
          const code = (
            new URL(request.url()).searchParams.get('dict_type_table.code') || ''
          ).replace(/^eq\./, '')
          return route.fulfill({
            json: (formStandardTransportDictionaries[code] || []).map((item, sort) => ({
              ...item,
              id: `${code}-${sort}`,
              sort,
              status: '1',
              dict_type_table: { code, name: code }
            }))
          })
        }
        if (request.method() !== 'GET' && !path.includes('/rpc/')) {
          unexpected.push(`${request.method()} ${path}`)
          return route.fulfill({ status: 403, json: { message: 'unexpected mutation' } })
        }
        if (path.endsWith('/scm_purchase_document'))
          return route.fulfill({ json: readonlyPurchase })
        if (path.endsWith('/scm_sales_document')) return route.fulfill({ json: readonlySales })
        const headers = {
          'content-range': '0-0/1',
          'access-control-expose-headers': 'content-range'
        }
        if (path.endsWith('/tms_service_case'))
          return route.fulfill({ json: [nativeService], headers })
        if (path.endsWith('/tms_transport_agreement'))
          return route.fulfill({ json: [nativeAgreement], headers })
        if (path.endsWith('/tms_electronic_contract'))
          return route.fulfill({
            json: new URL(request.url()).searchParams.has('id')
              ? nativeElectronic
              : [nativeElectronic],
            headers
          })
        if (/vms_list_(fuel|electric)_card_entries_secure$/.test(path))
          return route.fulfill({
            json: {
              records: [ledgerDetail(item.entry.endsWith('recharge') ? 'recharge' : 'consume')],
              total: 1
            }
          })
        if (/vms_list_(fuel|electric)_cards_secure$/.test(path))
          return route.fulfill({ json: { records: [], total: 0 } })
        if (path.endsWith('/mdm_list_production_equipment_v2_secure'))
          return route.fulfill({
            json: {
              records: [
                {
                  id: '22222222-2222-4222-8222-222222222222',
                  tenantId: '11111111-1111-4111-8111-111111111111',
                  equipmentCode: 'EQ-TEST',
                  equipmentName: '验收生产设备',
                  categoryName: '验收分类',
                  categoryId: null,
                  status: 'enabled',
                  model: 'MODEL-TEST',
                  standardUtilization: 80,
                  createTime: '2026-10-31T08:00:00Z',
                  updateTime: '2026-10-31T08:00:00Z'
                }
              ],
              total: 1,
              overview: { total: 1, enabled: 1, connected: 0, unassigned: 0 },
              references: {
                categories: [],
                departments: [],
                locations: [],
                workCenters: [],
                suppliers: []
              }
            }
          })
        return route.fallback()
      })
      await page.goto(
        `/tests/e2e/fixtures/form-standard-transport.html?entry=${item.entry}&theme=${visual.theme}`
      )
      if (/native-(fuel|electric)/.test(item.entry))
        await page.getByText('CARD-TEST', { exact: true }).first().click()
      else if (item.entry === 'equipment-detail' || item.entry.startsWith('native-'))
        await page.getByRole('button', { name: '查看', exact: true }).first().click()
      else await page.getByRole('button', { name: '打开真实业务入口', exact: true }).click()
      const overlay = page.getByRole('dialog').last()
      await expect(overlay).toBeVisible()
      await expect(overlay.getByText(item.text, { exact: true }).first()).toBeVisible()
      await expect(overlay.locator('.art-async-state[aria-busy="true"]')).toHaveCount(0)
      const tabs = overlay.getByRole('tab')
      await expect(tabs).toHaveCount(item.tabs)
      await expect(
        overlay.locator('input:not([type="hidden"]),textarea,[contenteditable="true"]')
      ).toHaveCount(0)
      const count = await tabs.count()
      for (let index = 0; index < Math.max(count, 1); index++) {
        if (count) await tabs.nth(index).click()
        expect(
          await overlay.evaluate((element) => element.scrollWidth > element.clientWidth + 1)
        ).toBe(false)
        await overlay.screenshot({
          path: info.outputPath(`pane-${index + 1}.png`),
          animations: 'disabled',
          timeout: 60_000
        })
      }
      expect(unexpected).toEqual([])
      expect(errors).toEqual([])
      if (count) {
        await overlay
          .getByRole('button', { name: /关闭弹窗|关闭抽屉|^关闭$/ })
          .first()
          .click()
        if (/native-(fuel|electric)/.test(item.entry))
          await page.getByText('CARD-TEST', { exact: true }).first().click()
        else if (item.entry === 'equipment-detail' || item.entry.startsWith('native-'))
          await page.getByRole('button', { name: '查看', exact: true }).first().click()
        else await page.getByRole('button', { name: '打开真实业务入口', exact: true }).click()
        await expect(overlay.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true')
      }
    })
  }
}
