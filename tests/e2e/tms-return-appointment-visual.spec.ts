import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const viewports = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 390, height: 844 }
]

async function captureVariants(page: import('@playwright/test').Page, name: string) {
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.classList.toggle('dark', value === 'dark')
    }, theme)
    for (const viewport of viewports) {
      await page.setViewportSize(viewport)
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1)
      await page.locator('.art-drawer:visible').screenshot({
        path: `.artifacts/order-open-20261104/return-appointment-ui/${name}-${viewport.width}-${theme}.png`,
        animations: 'disabled'
      })
    }
  }
}

test('返程三步表单在桌面、窄屏、深色下可用', async ({ page }) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  const customerTenantIds: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/rpc/tms_list_return_trip_candidates_secure', (route) =>
    route.fulfill({
      json: [
        {
          id: '00000000-0000-4000-a000-000000000011',
          waybillNo: 'YD202611-018',
          status: 'accepted',
          tenantId: '11111111-1111-4111-8111-111111111111',
          orderId: 'order-return-test',
          driverId: '33333333-3333-4333-8333-333333333333',
          vehicleId: '55555555-5555-4555-8555-555555555555',
          hasReturnLeg: false,
          hasForwardAllocation: true,
          canAddReturn: true
        }
      ]
    })
  )
  await page.route('**/rest/v1/rpc/tms_list_customer_options_secure', (route) => {
    const body = route.request().postDataJSON() as { p_tenant_id?: string }
    customerTenantIds.push(body.p_tenant_id || '')
    return route.fulfill({ json: [{ id: 'customer-demo', customerName: '示例客户' }] })
  })
  await page.goto('/tests/e2e/fixtures/tms-return-trip-drawer.html', {
    waitUntil: 'domcontentloaded'
  })
  const drawer = page.locator('.art-drawer:visible')
  await expect(drawer.getByText('将沿用调度单')).toContainText('YD202611-018')
  expect(customerTenantIds).toEqual(['11111111-1111-4111-8111-111111111111'])
  await expect(drawer.getByRole('button', { name: '3 · 货物信息' })).toBeDisabled()
  await captureVariants(page, 'return')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await drawer.locator('[data-art-form-item-key="shippingCustomerId"] .el-select').click()
  await page.getByRole('option', { name: '示例客户' }).click()
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
  await expect(drawer.getByRole('button', { name: '创建返程运输单' })).toBeVisible()
  expect(errors).toEqual([])
})

test('提货预约只读调度快照在桌面、窄屏、深色下可用', async ({ page }) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const url = route.request().url()
    if (url.includes('/rpc/tms_get_appointment_dispatch_snapshot_secure'))
      return route.fulfill({
        json: {
          driverName: '验收司机',
          driverPhone: '13800000000',
          plateNo: '测A12345',
          vehicleType: '厢式货车',
          loadCapacityTon: 8,
          vehicleLengthM: 9.6
        }
      })
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/scrollbar-workspace.html?page=appointment-delete')
  await page.getByRole('button', { name: '打开预约' }).click()
  const drawer = page.locator('.art-drawer:visible')
  await expect(
    drawer.locator('[data-art-form-item-key="entries.0.driverPhone"] input')
  ).toBeDisabled()
  await expect(drawer.locator('[data-art-form-item-key="entries.0.plateNo"] input')).toBeDisabled()
  await captureVariants(page, 'pickup')
  expect(errors).toEqual([])
})
