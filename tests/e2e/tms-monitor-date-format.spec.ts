import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.setTimeout(90_000)

for (const mode of ['valid', 'empty', 'invalid', 'time-only']) {
  test('在途监控业务日期 ' + mode, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/tests/e2e/fixtures/tms-monitor-date-format.html?mode=' + mode)
    const shortDates = page.locator('.monitor-route-card__meta > span')
    const fullDates = page.locator('.detail-route em')
    await expect(shortDates).toHaveText(
      mode === 'valid' ? ['10-09 12:34', '10-09 12:34'] : ['-', '-']
    )
    await expect(fullDates).toHaveText(
      mode === 'valid' ? ['2026-10-09 12:34', '2026-10-09 12:34'] : ['-', '-']
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
    if (mode === 'valid')
      await page.screenshot({ path: info.outputPath('monitor-dates.png'), fullPage: true })
  })
}

for (const mode of ['telemetry-missing', 'telemetry-real', 'telemetry-zero']) {
  test('定位和速度不生成虚构值 ' + mode, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    await page.clock.install({ time: new Date('2026-10-10T06:00:00Z') })
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/tests/e2e/fixtures/tms-monitor-date-format.html?mode=' + mode)
    const model = page.getByTestId('telemetry-model')
    await expect(model).toContainText('定位验收运单')
    const data = JSON.parse((await model.textContent()) ?? '{}')
    expect(data.overview.onTimeRate).toBeNull()
    expect(data.overview).not.toHaveProperty('growthRate')
    if (mode === 'telemetry-missing') {
      for (const key of ['speed', 'progress', 'completedKm', 'remainingKm', 'totalKm'])
        expect(data.order[key]).toBeNull()
      expect(data.order).not.toHaveProperty('currentGeo')
      expect(data.order).not.toHaveProperty('originGeo')
      expect(data.order).not.toHaveProperty('destinationGeo')
      await expect(page.locator('.detail-speed').first()).toContainText('--')
      await expect(page.locator('.monitor-route-card__cities > span')).toHaveText('--')
      await expect(page.locator('.monitor-route-card__track > em')).toHaveCount(0)
    } else {
      expect(data.order.currentGeo).toEqual(mode === 'telemetry-zero' ? [0, 0] : [120, 30])
      expect(data.order.speed).toBe(mode === 'telemetry-zero' ? 0 : 73)
      expect(data.order.progress).toBe(50)
      await expect(page.locator('.detail-speed strong').first()).toHaveText(
        (mode === 'telemetry-zero' ? '0' : '73') + 'km/h'
      )
      await expect(page.locator('.monitor-route-card__cities > span')).toHaveText('50%')
    }
    await expect(page.locator('.detail-progress')).toContainText('时间估算进度')
    await expect(page.locator('.monitor-route-card__source')).toContainText('暂无轨迹数据')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
    await page.screenshot({ path: info.outputPath('telemetry.png'), fullPage: true })
  })
}

for (const panel of ['realtime', 'vehicle', 'waybill']) {
  test('统计面板保留未知数据 ' + panel, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(
      '/tests/e2e/fixtures/tms-monitor-date-format.html?mode=telemetry-missing&panel=' + panel
    )
    const text = await page.locator('main').innerText()
    expect(text).not.toContain('null%')
    expect(text).not.toContain('较昨日')
    expect(text).not.toContain('进度正常')
    expect(text).not.toContain('运行正常')
    await expect(
      page.locator(panel === 'realtime' ? '.monitor-metric strong' : '.summary-grid strong').nth(1)
    ).toHaveText('--')
    if (panel !== 'realtime')
      await expect(page.locator('.summary-grid strong').nth(2)).toHaveText('--')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
    await page.screenshot({ path: info.outputPath('summary.png'), fullPage: true })
  })
}

test('在途监控查询失败后可重试，不伪装成空数据', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.clock.install({ time: new Date('2026-10-10T06:00:00Z') })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let failed = true
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/rpc/tms_list_waybills_secure')) {
      return failed
        ? route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
        : route.fulfill({
            json: {
              records: [
                {
                  waybillNo: '真实在途记录',
                  status: 'transporting',
                  vehicle: { plateNo: '沪A真实' }
                }
              ],
              total: 1
            }
          })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/tms-monitor-date-format.html?root')
  const retry = page
    .locator('.art-async-state')
    .first()
    .getByRole('button', { name: '重新加载', exact: true })
  await expect(retry).toBeVisible()
  await expect(page.locator('.art-async-state').first()).toContainText(/权限|拒绝/)
  failed = false
  await retry.click()
  await expect(page.locator('.vehicle-card').filter({ hasText: '真实在途记录' })).toBeVisible()
  await expect(page.locator('.vehicle-card__progress-value')).toContainText('--')
  await expect(page.locator('.vehicle-card__poi')).toContainText('暂无 GPS 位置')
  failed = true
  await page.clock.fastForward(60_000)
  await expect(retry).toBeVisible()
  await expect(page.locator('.art-async-state').first()).toContainText(/权限|拒绝/)
  failed = false
  await retry.click()
  await expect(page.locator('.vehicle-card').filter({ hasText: '真实在途记录' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
  await page.screenshot({ path: info.outputPath('monitor-root.png'), fullPage: true })
})

test('准时率基于实际到达记录，不把在途未知记录计为准时', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto(
    '/tests/e2e/fixtures/tms-monitor-date-format.html?mode=telemetry-arrivals&panel=realtime'
  )
  const model = JSON.parse((await page.getByTestId('telemetry-model').textContent()) ?? '{}')
  expect(model.overview.onTimeRate).toBe(50)
  expect(model.overview.arrivalCount).toBe(2)
  await expect(page.locator('.monitor-metric strong').nth(1)).toHaveText('50%')
  await expect(page.locator('.monitor-metric').nth(1)).toContainText('2 条到达记录')
})

test('地图失败复用公共状态，重试保留画布并恢复操作', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.addInitScript(() => {
    class FakeMap {
      constructor(container: HTMLElement) {
        if (document.documentElement.dataset.failMap !== 'false')
          throw new Error('test map unavailable')
        container.dataset.mapInitialized = 'true'
      }
      setStatus() {}
      addControl() {}
      on() {}
      getZoom() {
        return 5
      }
      resize() {}
      destroy() {}
      add() {}
      remove() {}
      setCenter() {}
      setZoom() {}
      setFitView() {}
    }
    Object.defineProperty(window, 'AMap', {
      value: {
        Map: FakeMap,
        Scale: class {},
        Driving: class {},
        Geocoder: class {}
      },
      configurable: true
    })
  })
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/tms-monitor-date-format.html?root')
  const state = page.locator('.monitor-map .art-async-state')
  await expect(state).toContainText('地图暂不可用')
  await expect(page.getByRole('button', { name: '放大地图', exact: true })).toBeDisabled()
  await page.screenshot({ path: info.outputPath('map-error.png'), fullPage: true })
  await page.evaluate(() => {
    document.documentElement.dataset.failMap = 'false'
  })
  await state.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.locator('[data-map-initialized=true]')).toBeVisible()
  await expect(state).toHaveCount(0)
  await expect(page.getByRole('button', { name: '放大地图', exact: true })).toBeEnabled()
})

test('补充查询失败显示错误，旧请求失败不能覆盖新查询', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.clock.install({ time: new Date('2026-10-10T06:00:00Z') })
  let failFallback = true
  let primaryCalls = 0
  let releaseOld: (() => void) | undefined
  const oldRequest = new Promise<void>((resolve) => {
    releaseOld = resolve
  })
  await page.route('**/rest/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/rpc/tms_list_orders_secure'))
      return route.fulfill({
        status: failFallback ? 403 : 200,
        json: failFallback
          ? { code: '42501', message: 'permission denied' }
          : { records: [], total: 0 }
      })
    if (path.endsWith('/rpc/tms_list_waybills_secure')) {
      primaryCalls++
      if (primaryCalls === 3) {
        await oldRequest
        return route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
      }
      return route.fulfill({
        json: {
          records: [{ waybillNo: `当前记录${primaryCalls}`, status: 'transporting' }],
          total: 1
        }
      })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/tms-monitor-date-format.html?root')
  const outer = page.locator('.art-async-state').first()
  await expect(outer).toContainText(/权限|拒绝/)
  failFallback = false
  await outer.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.locator('.vehicle-card')).toContainText('当前记录2')
  await page.clock.fastForward(60_000)
  await expect.poll(() => primaryCalls).toBe(3)
  await page.clock.fastForward(60_000)
  await expect(page.locator('.vehicle-card')).toContainText('当前记录4')
  const staleResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/tms_list_waybills_secure') && response.status() === 403
  )
  releaseOld?.()
  await (await staleResponse).finished()
  await page.clock.runFor(32)
  await expect.poll(() => page.locator('.vehicle-card').innerText()).toContain('当前记录4')
  await expect(outer).not.toContainText(/权限|拒绝/)
  await expect(page.locator('.el-message--error')).toHaveCount(0)
})
