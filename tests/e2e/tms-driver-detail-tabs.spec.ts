import { expect, test } from '@playwright/test'

const driverId = '11111111-1111-4111-8111-111111111401'
const orderId = '11111111-1111-4111-8111-111111111201'
const relation = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  orderId,
  orderNo: 'YD202610-001',
  orderStatus: 'transporting',
  waybillId: '11111111-1111-4111-8111-111111111301',
  waybillNo: 'DD202610-001',
  waybillStatus: 'transporting',
  vehicleId: '11111111-1111-4111-8111-111111111501',
  plateNo: '测A12345',
  driverId,
  driverName: '测试司机甲',
  departedAt: '2026-10-26T08:00:00+08:00',
  completedAt: null,
  originStation: '青岛',
  destinationStation: '济南',
  executionKind: 'single',
  dispatchMode: 'carrier',
  dispatchTargetName: '测试承运商',
  shippingAddress: '测试发货地址',
  receivingAddress: '测试收货地址',
  orderCreatedAt: '2026-10-25T10:00:00+08:00',
  arrivedAt: null,
  signedAt: null,
  receiptAt: null,
  cargoType: '钢材',
  cargoQuantity: 20,
  cargoVolumeM3: 3.5,
  cargoWeightKg: 2100,
  insuranceFee: 120,
  deliveryFee: 80,
  unloadingFee: 30,
  orderTotalFee: 2300,
  relationFreightAmount: 1150,
  detailsAvailable: true
}

test.use({ storageState: { cookies: [], origins: [] } })

test('司机详情按页签组织承运宽表与费用，窄屏只在表内滚动', async ({ page }, testInfo) => {
  test.setTimeout(480_000)
  page.on('pageerror', (error) => console.error('driver-detail pageerror:', error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('driver-detail console:', message.text())
  })
  await page.route('**/rest/v1/sys_dictionary?**', (route) => {
    const url = new URL(route.request().url())
    const dictCode = String(url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
    const entries: Record<string, Array<[string, string]>> = {
      fmsExpenseDocumentStatus: [['approved', '已审核']],
      fmsRepaymentStatus: [['completed', '已还款']],
      tmsReimbursementApprovalStatus: [['approved', '已审核']],
      tmsDispatchOperatorMode: [['carrier', '承运方']],
      tmsWaybillStatus: [['transporting', '运输中']],
      tmsDriverType: [['primary', '主驾']],
      tmsDriverLicenseType: [['A1', 'A1']],
      commonEnabledStatus: [['enabled', '启用']]
    }
    return route.fulfill({
      status: 200,
      json: (entries[dictCode] || []).map(([value, label], index) => ({
        id: `dict-${dictCode}-${index}`,
        type_id: `type-${dictCode}`,
        code: value,
        value,
        label,
        status: '1',
        sort: index + 1,
        dict_type_table: { code: dictCode, name: dictCode }
      }))
    })
  })
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    let json: unknown = { records: [], total: 0, available: true, linkedEmployee: false }
    if (name === 'tms_get_driver_secure') {
      json = {
        id: driverId,
        driverName: '测试司机甲',
        tenantId: relation.tenantId,
        carrier: { companyName: '测试承运商' },
        driverType: 'primary',
        licenseType: 'A1',
        enabled: true,
        employeeId: '11111111-1111-4111-8111-111111111601',
        fieldAccess: {},
        assignedVehicles: [{ id: relation.vehicleId, plateNo: relation.plateNo }]
      }
    } else if (name === 'tms_list_transport_mainline_relations_secure') {
      json = {
        records: [
          relation,
          {
            ...relation,
            orderId: 'order-2',
            orderNo: 'YD202610-002',
            waybillId: 'waybill-2',
            waybillNo: 'DD202610-002',
            arrivedAt: '2026-10-26T18:00:00+08:00'
          }
        ],
        total: 2
      }
    } else if (name === 'tms_list_current_driver_mainline_relations_secure') {
      json = { records: [relation], total: 1 }
    } else if (name === 'tms_list_driver_finance_records_secure') {
      const kind = route.request().postDataJSON()?.p_kind
      json = {
        records: [
          {
            id: `${kind}-1`,
            no: `${kind}-20261001`,
            occurredOn: '2026-10-26',
            status: kind === 'repayment' ? 'completed' : 'approved',
            amount: 100,
            waybillId: null,
            waybillNo: null,
            orderNo: null,
            costType: null,
            reason: '测试用途',
            remark: null,
            relatedNo: null,
            settlementStatus: null
          }
        ],
        total: 1
      }
    }
    await route.fulfill({ status: 200, json })
  })

  await page.goto('/tests/e2e/fixtures/tms-mainline-visual.html?page=driver-detail')
  await expect(page.getByRole('heading', { name: '测试司机甲' })).toBeVisible({ timeout: 300_000 })
  if (testInfo.project.name.includes('dark')) {
    await page.evaluate(() => document.documentElement.classList.add('dark'))
  }
  await expect(page.getByText('当前出车', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '承运订单与车辆明细' }).click()
  await expect(page.getByRole('columnheader', { name: '运输订单号' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '总运费', exact: true })).toHaveCount(1)
  await expect(page.getByRole('columnheader', { name: '订单总运费' })).toHaveCount(1)
  await expect(page.getByText('YD202610-002')).toBeVisible()
  await expect(page.getByText('正向货配载').first()).toBeVisible()
  await expect(page.getByText('测试发货地址')).toHaveCount(2)
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  expect(bodyOverflow).toBeLessThanOrEqual(1)
  await page.screenshot({
    path: `.artifacts/driver-detail-tabs-${testInfo.project.name}-orders.png`,
    fullPage: true
  })
  await page.getByRole('tab', { name: '费用明细' }).click()
  await expect(page.getByText('借款明细', { exact: true })).toBeVisible()
  await expect(page.getByText('还款明细', { exact: true })).toBeVisible()
  await expect(page.getByText('费用报销明细', { exact: true })).toBeVisible()
  await expect(page.getByText('loan-20261001')).toBeVisible()
  await expect(page.getByText('已审核', { exact: true })).toHaveCount(2)
  await expect(page.getByText('已还款', { exact: true })).toHaveCount(1)
  await page.screenshot({
    path: `.artifacts/driver-detail-tabs-${testInfo.project.name}-costs.png`,
    fullPage: true
  })
})
