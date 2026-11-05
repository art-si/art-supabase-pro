import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(300_000)

const driverId = '33333333-3333-4333-8333-333333333333'
const vehicleId = '55555555-5555-4555-8555-555555555555'

async function captureDrawerVariants(
  page: Page,
  info: import('@playwright/test').TestInfo,
  name: string,
  focus: Locator
) {
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
      await focus.scrollIntoViewIfNeeded()
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1)
      await page.screenshot({
        path: info.outputPath(`${name}-${viewport.width}-${theme}.png`),
        animations: 'disabled'
      })
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
}

async function openReturnDrawer(page: Page, withSource: boolean) {
  await prepareIsolatedSession(page)
  const kinds: string[] = []
  const candidateTenantIds: string[] = []
  const writes: Array<Record<string, unknown>> = []
  await page.route('**/rest/v1/rpc/tms_list_return_trip_candidates_secure', (route) =>
    route.fulfill({
      json: withSource
        ? [
            {
              id: '77777777-7777-4777-8777-777777777777',
              waybillNo: 'YD202611-018',
              status: 'accepted',
              orderId: 'order-return-test',
              tenantId: '11111111-1111-4111-8111-111111111111',
              driverId,
              vehicleId,
              driverName: '正向司机',
              plateNo: '测A12345',
              canAddReturn: true
            }
          ]
        : []
    })
  )
  await page.route('**/rest/v1/rpc/tms_list_customer_options_secure', (route) =>
    route.fulfill({ json: [{ id: 'customer-demo', customerName: '示例客户' }] })
  )
  await page.route('**/rest/v1/mdm_station?*', (route) =>
    route.fulfill({
      headers: { 'content-range': '0-2/3', 'access-control-expose-headers': 'content-range' },
      json: [
        {
          id: 'station-one',
          stationCode: 'W1',
          stationName: '中途站甲',
          stationType: 'transfer',
          longitude: 120.2,
          latitude: 30.2
        },
        {
          id: 'station-two',
          stationCode: 'W2',
          stationName: '中途站乙',
          stationType: 'transfer',
          longitude: 120.4,
          latitude: 30.4
        },
        {
          id: 'station-three',
          stationCode: 'W3',
          stationName: '中途站丙',
          stationType: 'transfer',
          longitude: 120.6,
          latitude: 30.6
        }
      ]
    })
  )
  await page.route('**/rest/v1/rpc/tms_list_dispatch_candidates_secure', (route) => {
    const body = route.request().postDataJSON() as {
      p_kind: string
      p_keyword?: string
      p_tenant_id?: string
    }
    kinds.push(body.p_kind)
    candidateTenantIds.push(body.p_tenant_id || '')
    const records =
      body.p_kind === 'driver'
        ? [
            {
              id: driverId,
              tenantId: '11111111-1111-4111-8111-111111111111',
              driverName: '返程司机甲',
              phone: '13800000001',
              plateNo: '测A12345',
              vehicleId
            }
          ]
        : [
            {
              id: vehicleId,
              tenantId: '11111111-1111-4111-8111-111111111111',
              plateNo: '测A12345',
              vehicleType: '厢式货车',
              vehicleOwnership: 'carrier',
              primaryDriverId: driverId
            }
          ].filter((vehicle) => !body.p_keyword || body.p_keyword === vehicle.id)
    return route.fulfill({ json: { records, total: records.length } })
  })
  await page.route('**/rest/v1/rpc/tms_create_return_order_secure', (route) => {
    writes.push(route.request().postDataJSON() as Record<string, unknown>)
    return route.fulfill({
      json: {
        orderId: 'return-order-test',
        orderNo: 'ORD-RETURN-001-R01',
        waybillId: 'return-waybill-test',
        waybillNo: 'YD-RETURN-001-R01'
      }
    })
  })
  await page.goto('/tests/e2e/fixtures/tms-return-trip-drawer.html', {
    waitUntil: 'domcontentloaded'
  })
  const drawer = page.locator('.art-drawer:visible')
  await expect(drawer.getByText('新增返程运输单', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: '发货地址操作' })).toBeVisible()
  return { drawer, kinds, candidateTenantIds, writes }
}

async function fillContacts(drawer: Locator) {
  await drawer.locator('[data-art-form-item-key="shippingCustomerId"] .el-select').click()
  await drawer.page().getByRole('option', { name: '示例客户' }).click()
  for (const [key, value] of Object.entries({
    shippingContactName: '发货联系人',
    shippingContactPhone: '13800000001',
    receivingContactName: '收货联系人',
    receivingContactPhone: '13800000002'
  })) {
    await drawer.locator(`[data-art-form-item-key="${key}"] input`).fill(value)
  }
  await drawer
    .locator(
      '[data-art-form-item-key="shippingAddressPicker"] .art-address-picker__address-input input'
    )
    .fill('杭州市测试路 1 号')
  await drawer
    .locator(
      '[data-art-form-item-key="receivingAddressPicker"] .art-address-picker__address-input input'
    )
    .fill('上海市测试路 2 号')
}

test('选正向调度单时沿用司机车辆并进入配置步骤', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const { drawer, kinds } = await openReturnDrawer(page, true)
  await expect(drawer.getByText('将沿用调度单')).toContainText('YD202611-018')
  await expect(drawer.getByText('将沿用调度单')).toContainText('正向司机 / 测A12345')
  await expect(drawer.locator('[data-art-form-item-key="dispatchDriverId"]')).toHaveCount(0)
  await fillContacts(drawer)
  await drawer.getByRole('button', { name: '下一步' }).click()
  await expect(drawer.getByRole('button', { name: '2 · 配置信息' })).toHaveAttribute(
    'aria-current',
    'step'
  )
  expect(kinds).toEqual([])
  expect(pageErrors).toEqual([])
})

test('发货与收货地址图标沿用开单的识别及常用地址入口', async ({ page }) => {
  const { drawer } = await openReturnDrawer(page, true)
  await drawer.getByRole('button', { name: '发货地址操作' }).click()
  await page.getByRole('menuitem', { name: /地址识别/ }).click()
  await expect(page.getByText('智能填写地址', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await drawer.getByRole('button', { name: '收货地址操作' }).click()
  await page.getByRole('menuitem', { name: /选择地址/ }).click()
  await expect(page.getByText('选择收货地址', { exact: true })).toBeVisible()
})

test('无正向调度单时选择司机并自动带入关联车辆后提交', async ({ page }, info) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const { drawer, kinds, candidateTenantIds, writes } = await openReturnDrawer(page, false)
  await expect(drawer.locator('[data-art-form-item-key="dispatchDriverId"]')).toBeVisible()
  await expect(drawer.locator('[data-art-form-item-key="dispatchVehicleId"]')).toBeVisible()
  await drawer.getByRole('button', { name: '添加途经点（0/3）' }).click()
  await drawer.locator('[data-art-form-item-key="transferStationIds"] .el-select').click()
  await page.getByRole('option', { name: '中途站甲' }).click()
  await page.getByRole('option', { name: '中途站乙' }).click()
  await page.getByRole('option', { name: '中途站丙' }).click()
  await page.keyboard.press('Escape')
  await expect(drawer.getByRole('button', { name: /添加途经点/ })).toBeDisabled()
  await drawer.getByRole('button', { name: '移除途经点 3' }).click()
  await drawer.getByRole('button', { name: '上移' }).last().click()
  await captureDrawerVariants(
    page,
    info,
    'return-waypoints',
    drawer.getByRole('button', { name: /添加途经点/ })
  )
  await fillContacts(drawer)
  await drawer.getByRole('button', { name: '下一步' }).click()
  await expect(drawer.getByRole('button', { name: '1 · 收发信息' })).toHaveAttribute(
    'aria-current',
    'step'
  )

  await drawer.getByPlaceholder('请选择返程司机').click()
  const selector = page.locator('.art-data-select-dialog').last()
  await expect(selector.getByText('返程司机甲')).toBeVisible()
  await selector.getByRole('row', { name: /返程司机甲/ }).click()
  await selector.getByRole('button', { name: '确定' }).click()
  await expect(drawer.getByPlaceholder('请选择返程车辆')).toHaveValue('测A12345')
  expect(kinds).toContain('driver')
  expect(kinds).toContain('return_vehicle')
  expect(candidateTenantIds).toEqual(kinds.map(() => '11111111-1111-4111-8111-111111111111'))

  await drawer.getByRole('button', { name: '下一步' }).click()
  await expect(drawer.getByRole('button', { name: '2 · 配置信息' })).toHaveAttribute(
    'aria-current',
    'step'
  )
  await drawer.getByRole('button', { name: '下一步' }).click()
  await expect(drawer.getByRole('button', { name: '3 · 货物信息' })).toHaveAttribute(
    'aria-current',
    'step'
  )
  await drawer.locator('[data-art-form-item-key="cargoName"] input').fill('返程测试货物')
  await drawer.locator('[data-art-form-item-key="quantity"] input').fill('2')
  await drawer.getByRole('tab', { name: '应付信息' }).click()
  await drawer.locator('[data-art-form-item-key="payable.driverFreight"] input').fill('120')
  await captureDrawerVariants(
    page,
    info,
    'return-payable',
    drawer.getByRole('tab', { name: '应付信息' })
  )
  await drawer.getByRole('tab', { name: '装卸货信息' }).click()
  await drawer.locator('[data-art-form-item-key="loading.signerName"] input').fill('返程签收人')
  await captureDrawerVariants(
    page,
    info,
    'return-loading',
    drawer.getByRole('tab', { name: '装卸货信息' })
  )
  await drawer.getByRole('button', { name: '创建返程运输单' }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]?.p_source_waybill_id).toBeNull()
  expect(writes[0]?.p_payload).toMatchObject({
    dispatch_driver_id: driverId,
    dispatch_vehicle_id: vehicleId,
    transfer_station_ids: ['station-two', 'station-one'],
    transfer_station_id: 'station-two',
    order_config: {
      attachment_urls: [],
      payable: { driver_freight: 120, driver_settlement_method: 'cash' },
      loading: { load_photo_urls: [], signer_name: '返程签收人' }
    }
  })
  expect(pageErrors).toEqual([])
})
