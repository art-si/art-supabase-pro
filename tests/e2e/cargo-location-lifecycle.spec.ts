import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockDeviceGeolocation } from './support/mock-device-geolocation'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)
const mutations: Record<string, unknown>[] = []
const contextReads: string[] = []
const operationContext = (payload: Record<string, unknown>, checkedIn = false) => ({
  waybillId: payload.p_waybill_id,
  operationType: payload.p_operation_type,
  waybillStatus: payload.p_operation_type === 'unloading' ? 'transporting' : 'accepted',
  radiusM: 500,
  allowOutsideCheckIn: true,
  autoCheckIn: false,
  geofenceEnabled: false,
  canManage: true,
  operation: checkedIn
    ? {
        id: 'synthetic-operation',
        waybillId: payload.p_waybill_id,
        tenantId: '11111111-1111-4111-8111-111111111111',
        operationType: payload.p_operation_type,
        operationStatus: 'checked_in',
        checkinTime: '2026-10-23T00:00:00Z',
        checkinMode: 'admin',
        insideGeofence: true,
        distanceM: 0,
        locationAccuracyM: 8,
        weightTon: null,
        photoUrls: [],
        weighbridgeTicketUrls: [],
        remark: ''
      }
    : null
})
test.beforeEach(async ({ page }) => {
  mutations.length = 0
  contextReads.length = 0
  await prepareIsolatedSession(page)
  await page.clock.install()
  await mockDeviceGeolocation(page)
  await page.route('**/rest/v1/**', (route) => {
    const resource = new URL(route.request().url()).pathname.split('/').at(-1)
    const payload = route.request().postDataJSON() ?? {}
    if (resource === 'tms_check_in_waybill_cargo_operation') mutations.push(payload)
    if (resource === 'tms_get_waybill_cargo_operation_context')
      contextReads.push(payload.p_waybill_id)
    if (
      resource === 'tms_get_waybill_cargo_operation_context' ||
      resource === 'tms_check_in_waybill_cargo_operation'
    ) {
      return route.fulfill({
        json: operationContext(payload, resource === 'tms_check_in_waybill_cargo_operation')
      })
    }
    return route.fulfill({ json: [] })
  })
})

for (const profile of ['ordinary', 'platform-all', 'platform-selected']) {
  test(`${profile} 仅向已授权且当前范围内的原始运单打卡`, async ({ page }, info) => {
    await page.goto(`/tests/e2e/fixtures/cargo-location-lifecycle.html?profile=${profile}`, {
      waitUntil: 'domcontentloaded'
    })
    await page.getByRole('button', { name: '打开装卸表单', exact: true }).click()
    await page.getByRole('button', { name: '获取定位并打卡', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-location-requests', '1')
    await page.evaluate(() =>
      document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 1 } }))
    )
    await expect.poll(() => mutations.length).toBe(1)
    expect(mutations[0].p_waybill_id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(mutations[0].p_longitude).toBe(120.123456789)
    await expect(page.getByRole('dialog')).toContainText('约 8 米')
    await expect(page.getByRole('dialog')).toContainText('2026-10-23 08:00:00')
    if (profile === 'ordinary') {
      await page.screenshot({
        path: info.outputPath('cargo-checkin-current.png'),
        animations: 'disabled'
      })
      await page.getByRole('textbox', { name: '备注', exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({
        path: info.outputPath('cargo-form-lower.png'),
        animations: 'disabled'
      })
    }
  })
}

for (const profile of ['ordinary-forged', 'platform-outside']) {
  test(`${profile} 不读取或提交超出当前租户范围的运单`, async ({ page }) => {
    await page.goto(`/tests/e2e/fixtures/cargo-location-lifecycle.html?profile=${profile}`, {
      waitUntil: 'domcontentloaded'
    })
    await page.getByRole('button', { name: '打开装卸表单', exact: true }).click()
    await expect(page.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
    expect(contextReads).toEqual([])
    expect(mutations).toEqual([])
  })
}

test('定位期间切换租户后取消等待，旧结果不提交', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/cargo-location-lifecycle.html?profile=platform-selected', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开装卸表单', exact: true }).click()
  await page.getByRole('button', { name: '获取定位并打卡', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-location-requests', '1')
  await page.keyboard.press('F10')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 1 } }))
  )
  await page.clock.runFor(32)
  await expect(page.getByRole('button', { name: '获取定位并打卡', exact: true })).toBeDisabled()
  expect(mutations).toEqual([])
})

test('读取失败使用可重试状态，旧读取失败不覆盖新运单', async ({ page }, info) => {
  let fail = true
  let releaseOld!: () => void
  let oldCalls = 0
  await page.route('**/rest/v1/rpc/tms_get_waybill_cargo_operation_context', async (route) => {
    const payload = route.request().postDataJSON()
    if (payload.p_waybill_id.startsWith('a')) {
      oldCalls++
      if (oldCalls === 3)
        await new Promise<void>((resolve) => {
          releaseOld = resolve
        })
      if (fail || oldCalls === 3)
        return route.fulfill({ status: 403, json: { code: '42501', message: 'synthetic denied' } })
    }
    return route.fulfill({ json: operationContext(payload) })
  })
  await page.goto('/tests/e2e/fixtures/cargo-location-lifecycle.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开装卸表单', exact: true }).click()
  const retry = page.getByRole('button', { name: '重新加载', exact: true })
  await expect(retry).toBeVisible()
  await page.clock.runFor(64)
  await page.screenshot({ path: info.outputPath('cargo-read-error.png'), animations: 'disabled' })
  fail = false
  await retry.click()
  await expect(page.getByRole('button', { name: '获取定位并打卡', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '打开装卸表单', exact: true }).click()
  await expect.poll(() => oldCalls).toBe(3)
  await page.keyboard.press('F8')
  await expect(page.getByRole('dialog')).toContainText('合成订单-B')
  releaseOld()
  await page.clock.runFor(32)
  await expect(retry).toHaveCount(0)
  await expect(page.locator('.el-message--error')).toHaveCount(0)
})

test('已发出的旧请求保留真实成功刷新，但不关闭新表单或清除新定位状态', async ({ page }) => {
  let release!: () => void
  await page.route('**/rest/v1/rpc/tms_check_in_waybill_cargo_operation', async (route) => {
    const payload = route.request().postDataJSON()
    mutations.push(payload)
    if (payload.p_waybill_id.startsWith('a'))
      await new Promise<void>((resolve) => {
        release = resolve
      })
    return route.fulfill({ json: operationContext(payload, true) })
  })
  await page.goto('/tests/e2e/fixtures/cargo-location-lifecycle.html?arrival', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开装卸表单', exact: true }).click()
  const checkIn = page.getByRole('button', { name: '获取定位并打卡', exact: true })
  await checkIn.click()
  await expect(page.locator('html')).toHaveAttribute('data-location-requests', '1')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 1 } }))
  )
  await expect.poll(() => mutations.length).toBe(1)
  await page.keyboard.press('F8')
  await expect(page.getByRole('dialog')).toContainText('合成订单-B')
  await checkIn.click()
  await expect(page.locator('html')).toHaveAttribute('data-location-requests', '2')
  release()
  await expect(page.getByTestId('success-count')).toHaveText('1')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(checkIn).toHaveClass(/is-loading/)
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 2 } }))
  )
  await expect(page.getByTestId('success-count')).toHaveText('2')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('定位无回调也恢复打卡按钮，不产生伪造打卡', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/cargo-location-lifecycle.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开装卸表单', exact: true }).click()
  const checkIn = page.getByRole('button', { name: '获取定位并打卡', exact: true })
  await checkIn.click()
  await expect(page.locator('html')).toHaveAttribute('data-location-requests', '1')
  await page.clock.fastForward(15_001)
  await expect(checkIn).toBeEnabled()
  await expect(page.locator('.el-message--error')).toContainText('定位超时')
  expect(mutations).toEqual([])
})

test('切换运单后旧定位不得提交给新运单，新会话可立即操作', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/cargo-location-lifecycle.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开装卸表单', exact: true }).click()
  const checkIn = page.getByRole('button', { name: '获取定位并打卡', exact: true })
  await checkIn.click()
  await expect(page.locator('html')).toHaveAttribute('data-location-requests', '1')
  await page.keyboard.press('F8')
  await expect(page.getByRole('dialog')).toContainText('合成订单-B')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 1 } }))
  )
  await page.clock.runFor(32)
  expect(mutations).toEqual([])
  await expect(checkIn).toBeEnabled()
  await checkIn.click()
  await expect(page.locator('html')).toHaveAttribute('data-location-requests', '2')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 2 } }))
  )
  await expect.poll(() => mutations.length).toBe(1)
  expect(mutations[0].p_waybill_id).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
})

test('关闭后旧定位不打卡，权限撤回后也不发送变更', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/cargo-location-lifecycle.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开装卸表单', exact: true }).click()
  const checkIn = page.getByRole('button', { name: '获取定位并打卡', exact: true })
  await checkIn.click()
  await expect(page.locator('html')).toHaveAttribute('data-location-requests', '1')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 1 } }))
  )
  await page.clock.runFor(32)
  expect(mutations).toEqual([])
  await page.getByRole('button', { name: '打开装卸表单', exact: true }).click()
  await checkIn.click()
  await expect(page.locator('html')).toHaveAttribute('data-location-requests', '2')
  await page.keyboard.press('F9')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 2 } }))
  )
  await page.clock.runFor(32)
  expect(mutations).toEqual([])
})
