import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const fees = {
  transportFee: 1200,
  deliveryFee: 80,
  unloadingFee: 40,
  collectPaymentFee: 20,
  transferFee: 50,
  declaredValue: 20000,
  insuranceFee: 30,
  packageFee: 10,
  otherFee: 5,
  totalFee: 1435
}
const common = {
  originStation: '上海站',
  transferStation: '昆山站',
  destinationStation: '苏州站',
  shippingContactName: '验收发货人',
  shippingCustomerName: '验收客户甲',
  receivingContactName: '验收收货人',
  receivingCustomerName: '验收客户乙',
  cargoItems: [{ cargoName: '测试货物' }],
  cargoQuantityTotal: 10,
  cargoVolumeTotal: 3.5,
  cargoWeightTotal: 800,
  paymentMethod: 'monthly',
  createTime: '2026-11-05T02:00:00Z',
  createdByName: '验收开单员',
  fieldAccess: { freightAmounts: 'read', settlementAmounts: 'read' },
  ...fees
}
const pending = [
  {
    ...common,
    id: '11111111-1111-4111-8111-111111111201',
    orderNo: 'DD-PENDING-001',
    waybillNo: 'YD-PENDING-001',
    dispatchStatus: 'pending',
    hasReturnTrip: true
  },
  {
    ...common,
    id: '11111111-1111-4111-8111-111111111202',
    orderNo: 'DD-PENDING-002',
    waybillNo: 'YD-PENDING-002',
    dispatchStatus: 'pending',
    hasReturnTrip: false
  }
]
const loaded = [
  {
    ...common,
    id: '11111111-1111-4111-8111-111111111301',
    driverWaybillId: '11111111-1111-4111-8111-111111111301',
    waybillNo: 'YD-LOADED-001',
    orderNo: 'DD-PENDING-001',
    sourceOrderRefs: [
      { id: pending[0].id, orderNo: pending[0].orderNo },
      { id: pending[1].id, orderNo: pending[1].orderNo }
    ],
    executionKind: 'merge',
    dispatchStatus: 'dispatched',
    waybillStatus: 'accepted',
    dispatchDriverName: '验收司机甲',
    driverOwnership: 'company',
    carrierName: '验收承运商',
    companyName: '验收物流公司',
    dispatchPlateNo: '测A12345',
    hasReturnTrip: false
  },
  {
    ...common,
    id: '11111111-1111-4111-8111-111111111302',
    driverWaybillId: '11111111-1111-4111-8111-111111111302',
    waybillNo: 'YD-LOADED-002',
    orderNo: 'DD-RETURN-002',
    sourceOrderRefs: [{ id: pending[1].id, orderNo: 'DD-RETURN-002' }],
    executionKind: 'single',
    dispatchStatus: 'dispatched',
    waybillStatus: 'loading',
    dispatchDriverName: '验收司机乙',
    driverOwnership: 'company',
    carrierName: '验收承运商',
    companyName: '验收物流公司',
    dispatchPlateNo: '测A67890',
    hasReturnTrip: true
  }
]

for (const mode of ['pending', 'loaded'] as const) {
  test(`${mode === 'pending' ? '待配载派车' : '运输运单'}列表在深浅主题和窄屏下可读`, async ({
    page
  }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
      if (endpoint === 'tms_list_dispatch_workbench_secure') {
        const request = route.request().postDataJSON() as {
          p_mode: 'pending' | 'loaded'
          p_count_only: boolean
        }
        const records = request.p_mode === 'pending' ? pending : loaded
        return route.fulfill({
          json: {
            records: request.p_count_only ? [] : records,
            total: records.length,
            fieldAccess: { freightAmounts: 'read', settlementAmounts: 'read' },
            waybillStatusCounts: { accepted: 1, loading: 1 }
          }
        })
      }
      if (endpoint === 'tms_get_order_detail_secure') {
        const { p_id } = route.request().postDataJSON() as { p_id: string }
        const order = pending.find((item) => item.id === p_id)
        return route.fulfill({
          json: order
            ? {
                ...order,
                tenantId: '11111111-1111-4111-8111-111111111111',
                status: 'pending_order',
                orderConfig: {},
                cargoItems: common.cargoItems
              }
            : null
        })
      }
      if (endpoint === 'sys_dictionary') {
        const code = new URL(route.request().url()).searchParams
          .get('dict_type_table.code')
          ?.replace(/^eq\./, '')
        const labels: Record<string, Array<[string, string]>> = {
          tmsOrderPaymentMethod: [['monthly', '月结']],
          tmsWaybillDispatchStatus: [['pending', '待派车']],
          tmsWaybillStatus: [
            ['accepted', '待装货'],
            ['loading', '装货中']
          ]
        }
        return route.fulfill({
          json: (labels[code || ''] || []).map(([value, label], index) => ({
            id: `${code}-${index}`,
            code: value,
            label,
            value,
            sort: index,
            status: '1',
            dict_type_table: { code, name: code }
          }))
        })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `${process.env.E2E_FIXTURE_PREFIX || ''}/tests/e2e/fixtures/tms-waybill-list-visual.html?mode=${mode}`
    )
    await expect(
      page.getByRole('heading', { name: mode === 'pending' ? '待配载派车' : '运输运单' })
    ).toBeVisible()
    await expect(page.getByRole('row')).toHaveCount(3)
    for (const label of [
      '基础运费',
      '配送费',
      '卸货费',
      '回款费',
      '中转费',
      '声明价值',
      '保费',
      '包装费',
      '其他费用',
      '运费合计'
    ])
      await expect(page.getByRole('columnheader', { name: label })).toBeAttached()
    const tableScroll = page.locator('.el-table__body-wrapper .el-scrollbar__wrap').first()
    await expect
      .poll(() => tableScroll.evaluate((element) => element.scrollWidth > element.clientWidth))
      .toBe(true)
    await expect(page.getByText('返程', { exact: true })).toBeVisible()
    if (mode === 'loaded') {
      await expect(page.getByRole('link', { name: 'DD-PENDING-001' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'DD-PENDING-002' })).toBeVisible()
    }
    await expect(page.getByText('已使用前端默认列')).toBeHidden({ timeout: 15_000 })
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.classList.toggle('dark', value === 'dark')
      }, theme)
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 1280, height: 800 },
        { width: 390, height: 844 }
      ]) {
        await page.setViewportSize(viewport)
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
          .toBeLessThanOrEqual(1)
        await page.screenshot({
          path: info.outputPath(`${mode}-${viewport.width}-${theme}.png`),
          animations: 'disabled'
        })
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await tableScroll.evaluate((element) => {
      element.scrollLeft = element.scrollWidth
    })
    await page.screenshot({
      path: info.outputPath(`${mode}-fee-columns-1440-dark.png`),
      animations: 'disabled'
    })
    const hero = page.getByRole('heading', {
      name: mode === 'pending' ? '待配载派车' : '运输运单'
    })
    await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
    await expect(hero).toBeHidden()
    await expect(page.getByRole('table').last()).toBeVisible()
    await expect(page.getByText('Total 2')).toBeVisible()
    await page.screenshot({
      path: info.outputPath(`${mode}-focus-1440-dark.png`),
      animations: 'disabled'
    })
    await page.getByRole('button', { name: '退出专注模式' }).click()
    await expect(hero).toBeVisible()
    await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
    await page.keyboard.press('Escape')
    await expect(hero).toBeVisible()
    await page.getByRole('link', { name: 'DD-PENDING-001' }).first().click()
    const orderDrawer = page.locator('.art-drawer:visible')
    await expect(orderDrawer.getByText('运单详情 · DD-PENDING-001')).toBeVisible()
    for (const tab of ['运单收发信息', '配置信息', '货物信息', '应收信息'])
      await expect(orderDrawer.getByRole('tab', { name: tab })).toBeVisible()
    await orderDrawer.getByRole('tab', { name: '货物信息' }).click()
    await expect(orderDrawer.getByText('测试货物')).toBeVisible()
    await page.screenshot({
      path: info.outputPath(`${mode}-order-detail-drawer-1440-dark.png`),
      animations: 'disabled'
    })
    await expect(hero).toBeVisible()
    expect(errors).toEqual([])
  })
}
