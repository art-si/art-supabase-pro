import { expect, type Locator, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './isolated-session'
import { formStandardTransportDictionaries } from '../fixtures/form-standard-transport-dictionaries'
import {
  transportContract,
  transportOrder,
  transportDriver,
  transportDriverProfile,
  transportCommissionRule
} from '../fixtures/form-standard-tms-data'
const id = '22222222-2222-4222-8222-222222222222'
const referenceId = '33333333-3333-4333-8333-333333333333'
const tenantId = '11111111-1111-4111-8111-111111111111'
export interface TransportWrite {
  path: string
  payload: unknown
}
export async function openTransportEntry(
  page: Page,
  entry: string,
  writes: TransportWrite[],
  query = ''
) {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) || ''
    if (name === 'sys_dictionary') {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
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
    if (name === 'tms_get_driver_secure') return route.fulfill({ json: transportDriver })
    if (name === 'tms_get_driver_profile_secure')
      return route.fulfill({ json: transportDriverProfile })
    if (name === 'tms_list_driver_commission_rules_secure')
      return route.fulfill({ json: { records: [transportCommissionRule], total: 1 } })
    if (name === 'vms_list_vehicle_type_profiles_secure')
      return route.fulfill({
        json: [
          {
            id: referenceId,
            tenantId,
            category: '验收车型',
            lengthM: 12,
            loadTons: 30,
            volumeM3: 80,
            enabled: true
          }
        ]
      })
    if (name === 'tms_list_return_trip_candidates_secure')
      return route.fulfill({
        json: [
          {
            id: referenceId,
            tenantId,
            waybillNo: 'RETURN-TEST',
            status: 'transporting',
            orderId: id,
            hasReturnLeg: entry === 'return-summary',
            hasForwardAllocation: true,
            canAddReturn: true
          }
        ]
      })
    if (name === 'tms_preview_return_leg_commission_secure')
      return route.fulfill({
        json: {
          matched: false,
          amount: 0,
          projectedGrossProfit: 30,
          projectedGrossMargin: 100,
          allocatedToll: 0
        }
      })
    if (name === 'tms_get_return_shared_toll_secure') return route.fulfill({ json: 0 })
    if (name === 'tms_get_return_trip_summary_secure')
      return route.fulfill({
        json: {
          forwardRevenue: 50,
          returnRevenue: 30,
          tripPlannedRevenue: 80,
          returnDirectPlannedExpense: 10,
          returnAllocatedToll: 0,
          returnProjectedGrossProfit: 20,
          returnProjectedMargin: 66.67,
          returnPlannedCommission: 0,
          sharedApprovedToll: 0,
          actualAccountingStatus: 'complete',
          actualApprovedRevenue: 80,
          actualApprovedCost: 10,
          actualApprovedGrossProfit: 70
        }
      })
    if (name === 'vms_list_part_stock_secure')
      return route.fulfill({
        json: {
          records: [
            {
              partId: referenceId,
              partName: '验收库存配件',
              partCode: 'STOCK-TEST',
              model: 'MODEL-TEST',
              brand: '验收品牌',
              stockQty: 5,
              unit: '件'
            }
          ],
          total: 1
        }
      })
    if (name === 'vms_list_vehicle_archives_secure')
      return route.fulfill({
        json: {
          records: [
            {
              id: referenceId,
              tenantId,
              plateNo: '测A12345',
              companyName: '验收运输公司',
              auditStatus: 'approved'
            }
          ],
          total: 1,
          fieldAccess: {}
        }
      })
    if (name === 'tms_get_contract_secure') return route.fulfill({ json: transportContract })
    if (name === 'tms_get_order_quote_secure')
      return route.fulfill({ json: { order: transportOrder, quote: null } })
    if (
      [
        'tms_list_basic_carrier_options_secure',
        'tms_list_customer_options_secure',
        'tms_list_customer_address_options_secure',
        'tms_list_vehicle_options_secure'
      ].includes(name)
    )
      return route.fulfill({
        json: [
          {
            id: referenceId,
            tenantId,
            companyName: '验收承运商',
            customerName: '验收客户',
            plateNo: '测A12345',
            addressDetail: '验收路1号',
            contactName: '验收联系人',
            addressType: 'shipping'
          }
        ]
      })
    if (name === 'mdm_material')
      return route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: referenceId,
            tenant_id: tenantId,
            material_code: 'MAT-TEST',
            material_name: '验收货物',
            basic_unit: '件',
            enabled: true
          }
        ]
      })
    if (name === 'mdm_carrier' && request.method() === 'GET')
      return route.fulfill({
        json: request.headers().accept?.includes('vnd.pgrst.object')
          ? { id, tenant_id: tenantId }
          : []
      })
    if (name === 'tms_list_carriers_secure')
      return route.fulfill({ json: { records: [], total: 0 } })
    if (
      request.method() !== 'GET' &&
      (!url.pathname.includes('/rpc/') || /update|save|create|record/.test(name))
    ) {
      writes.push({ path: name, payload: request.postDataJSON() })
      const single = request.headers().accept?.includes('vnd.pgrst.object')
      return route.fulfill({
        json: url.pathname.includes('/rpc/') ? id : single ? { id } : [{ id }],
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
      })
    }
    return route.fallback()
  })
  await page.goto(`/tests/e2e/fixtures/form-standard-transport.html?entry=${entry}${query}`)
  await page.getByRole('button', { name: '打开真实业务入口', exact: true }).click()
  const dialog = page
    .getByRole('dialog')
    .filter({ has: page.locator('.art-dialog__viewport,.art-drawer__viewport') })
    .last()
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.art-dialog__viewport,.art-drawer__viewport')).toHaveAttribute(
    'aria-busy',
    'false'
  )
  await expect(dialog.locator('.art-form .art-async-state[aria-busy="true"]')).toHaveCount(0, {
    timeout: 30_000
  })
  return dialog
}
export function transportInput(dialog: Locator, key: string) {
  return dialog.locator(`[data-art-form-item-key="${key}"] :is(input,textarea)`).first()
}
