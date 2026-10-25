import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

test.beforeEach(async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.clock.install()
  await page.addInitScript(() => {
    let poiRequests = 0
    let drivingRequests = 0
    class FakeMap {
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
        Pixel: class {},
        Marker: class {
          setContent() {}
          setPosition() {}
          setzIndex() {}
        },
        Polyline: class {
          private zIndex?: number
          constructor(options: { zIndex?: number; path?: Array<{ lng: number; lat: number }> }) {
            this.zIndex = options.zIndex
            this.setPath(options.path ?? [])
          }
          setPath(path: Array<{ lng: number; lat: number }>) {
            if (this.zIndex === 150)
              document.documentElement.dataset.monitorRoadPath = JSON.stringify(
                path.map((point) => [point.lng, point.lat])
              )
          }
          setOptions() {}
        },
        LngLat: class {
          constructor(
            public lng: number,
            public lat: number
          ) {}
        },
        Driving: class {
          search(
            _origin: unknown,
            _destination: unknown,
            callback: (status: string, result: unknown) => void
          ) {
            const request = ++drivingRequests
            document.documentElement.dataset.drivingRequests = String(drivingRequests)
            document.addEventListener('resolve-monitor-route', (event) => {
              const detail = (event as CustomEvent<{ request: number; result: unknown }>).detail
              if (detail.request === request) callback('complete', detail.result)
            })
          }
        },
        Geocoder: class {
          getAddress(_position: number[], callback: (status: string, result: object) => void) {
            document.documentElement.dataset.poiRequests = String(++poiRequests)
            const mode = document.documentElement.dataset.poiMode
            if (mode === 'success' || (mode !== 'pending' && poiRequests > 4)) {
              callback('complete', { regeocode: { formattedAddress: '合成测试位置' } })
              return
            }
            document.addEventListener(
              mode === 'pending' ? 'reject-stale-poi' : 'resolve-stale-poi',
              () => {
                callback(mode === 'pending' ? 'error' : 'complete', {
                  regeocode: { formattedAddress: '过期位置' }
                })
              },
              { once: true }
            )
          }
        }
      },
      configurable: true
    })
  })
  await page.route('**/rest/v1/**', (route) => {
    const resource = new URL(route.request().url()).pathname.split('/').at(-1)
    return route.fulfill({
      json:
        resource === 'tms_list_waybills_secure'
          ? {
              records: Array.from({ length: 5 }, (_, index) => ({
                id: `synthetic-waybill-${index}`,
                waybillNo: `超时验收运单${index + 1}`,
                status: 'transporting',
                currentLongitude: 120 + index / 100,
                currentLatitude: 30,
                vehicle: { id: `synthetic-vehicle-${index}`, plateNo: `沪A测试${index + 1}` },
                ...(index === 0
                  ? {
                      shipperLongitude: 119,
                      shipperLatitude: 30,
                      receiverLongitude: 121,
                      receiverLatitude: 30,
                      originCity: '合成始发站'.repeat(8),
                      destinationCity: '合成目的站'.repeat(8)
                    }
                  : {})
              })),
              total: 5
            }
          : resource === 'tms_list_orders_secure'
            ? { records: [], total: 0 }
            : []
    })
  })
})

test('在途监控每分钟刷新一次，不重复订阅轮询', async ({ page }) => {
  let requests = 0
  page.on('request', (request) => {
    if (request.url().includes('/rpc/tms_list_waybills_secure')) requests++
  })
  await page.goto('/tests/e2e/fixtures/tms-monitor-date-format.html?root', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('.vehicle-card')).toHaveCount(5)
  expect(requests).toBe(1)
  await page.clock.fastForward(30_000)
  expect(requests).toBe(1)
  await page.clock.fastForward(30_001)
  await expect.poll(() => requests).toBe(2)
  await page.clock.fastForward(60_000)
  await expect.poll(() => requests).toBe(3)
})

test('位置查询无回调后释放并发槽和加载状态，路线超时后允许再次查询', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/tms-monitor-date-format.html?root', {
    waitUntil: 'domcontentloaded'
  })
  const cards = page.locator('.vehicle-card')
  await expect(cards).toHaveCount(5)
  await expect(page.locator('html')).toHaveAttribute('data-poi-requests', '4')
  await expect(page.locator('html')).toHaveAttribute('data-driving-requests', '1')
  await page.clock.fastForward(10_001)
  await expect(page.locator('html')).toHaveAttribute('data-poi-requests', '5')
  await expect(cards.first().locator('.vehicle-card__poi')).toContainText('暂未获取到 POI')
  await expect(cards.first().getByRole('button', { name: '刷新当前位置' })).not.toHaveClass(
    /is-loading/
  )
  await expect(cards.last().locator('.vehicle-card__poi')).toContainText('合成测试位置')
  await cards.nth(1).click()
  await cards.first().click()
  await expect(page.locator('html')).toHaveAttribute('data-driving-requests', '2')
  await page.evaluate(() => {
    document.documentElement.dataset.poiMode = 'success'
  })
  await cards.first().getByRole('button', { name: '刷新当前位置' }).click()
  await expect(cards.first().locator('.vehicle-card__poi')).toContainText('合成测试位置')
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('monitor-poi-recovered.png'), fullPage: true })
  await cards.last().scrollIntoViewIfNeeded()
  await expect(cards.last()).toBeVisible()
  await page.screenshot({ path: info.outputPath('monitor-poi-lower.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('同坐标手动刷新完成后，旧位置回调不能覆盖新结果', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/tms-monitor-date-format.html?root', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('html')).toHaveAttribute('data-poi-requests', '4')
  const card = page.locator('.vehicle-card').first()
  await page.evaluate(() => {
    document.documentElement.dataset.poiMode = 'success'
  })
  await card.getByRole('button', { name: '刷新当前位置' }).click()
  await expect(card.locator('.vehicle-card__poi')).toContainText('合成测试位置')
  await page.evaluate(() => {
    document.dispatchEvent(new Event('resolve-stale-poi'))
  })
  await page.clock.runFor(32)
  await expect(card.locator('.vehicle-card__poi')).toContainText('合成测试位置')
  await expect(card.getByRole('button', { name: '刷新当前位置' })).not.toHaveClass(/is-loading/)
  expect(errors).toEqual([])
})

test('旧手动刷新失败不提示过期错误，当前失败仍给出重试反馈', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/tms-monitor-date-format.html?root', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('html')).toHaveAttribute('data-poi-requests', '4')
  const card = page.locator('.vehicle-card').first()
  const refresh = card.getByRole('button', { name: '刷新当前位置' })
  await page.evaluate(() => {
    document.documentElement.dataset.poiMode = 'pending'
  })
  await refresh.click()
  await expect(refresh).toHaveClass(/is-loading/)
  await page.evaluate(() => {
    document.documentElement.dataset.poiMode = 'success'
  })
  await refresh.click()
  await expect(card.locator('.vehicle-card__poi')).toContainText('合成测试位置')
  await page.evaluate(() => {
    document.dispatchEvent(new Event('reject-stale-poi'))
  })
  await page.clock.runFor(32)
  await expect(page.locator('.el-message--warning')).toHaveCount(0)
  await expect(card.locator('.vehicle-card__poi')).toContainText('合成测试位置')
  await page.evaluate(() => {
    document.documentElement.dataset.poiMode = 'pending'
  })
  await refresh.click()
  await page.evaluate(() => {
    document.dispatchEvent(new Event('reject-stale-poi'))
  })
  await expect(page.locator('.el-message--warning')).toContainText(
    '当前坐标暂无 POI 信息，请稍后重试'
  )
  await expect(card.locator('.vehicle-card__poi')).toContainText('暂未获取到 POI')
  await expect(refresh).not.toHaveClass(/is-loading/)
  expect(errors).toEqual([])
})

test('地图标题、车辆标识和概览浮层互不遮挡，长线路保留完整提示', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/tms-monitor-date-format.html?root', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('.vehicle-card')).toHaveCount(5)
  const title = page.locator('.monitor-map__heading span')
  await expect(title).toHaveAttribute('title', /合成始发站.*合成目的站/)
  const compact = (page.viewportSize()?.width ?? 1440) <= 1100
  const overview = page.locator('.map-float--overview')
  if (compact) await expect(overview).toBeHidden()
  else {
    await expect(overview).toBeVisible()
    const overlaps = await page.locator('.monitor-map').evaluate((map) => {
      const overview = map.querySelector('.map-float--overview')!.getBoundingClientRect()
      return ['.monitor-map__heading', '.monitor-map__track-chip', '.monitor-map__tools'].map(
        (selector) => {
          const rect = map.querySelector(selector)!.getBoundingClientRect()
          return (
            rect.left < overview.right &&
            rect.right > overview.left &&
            rect.top < overview.bottom &&
            rect.bottom > overview.top
          )
        }
      )
    })
    expect(overlaps).toEqual([false, false, false])
  }
  const overflow = await title.evaluate((element) => ({
    content: element.textContent,
    title: element.getAttribute('title'),
    available: element.clientWidth,
    scroll: element.scrollWidth
  }))
  expect(overflow.title).toBe(overflow.content)
  expect(overflow.scroll).toBeGreaterThan(overflow.available)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('monitor-context-layout.png'), fullPage: true })
  for (const name of ['运单监控', '车辆监控', '实时监控']) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.locator('.monitor-map__heading')).toBeVisible()
    await expect(page.getByRole('button', { name: '放大地图', exact: true })).toBeEnabled()
  }
  expect(errors).toEqual([])
})

test('道路规划保留折返与六位精度，缺失几何不会缓存为直线且可重试', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/tms-monitor-date-format.html?root', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('html')).toHaveAttribute('data-driving-requests', '1')
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('resolve-monitor-route', {
        detail: { request: 1, result: { routes: [{}] } }
      })
    )
  )
  await page.clock.runFor(32)
  await expect(page.locator('html')).not.toHaveAttribute('data-monitor-road-path')
  const cards = page.locator('.vehicle-card')
  await cards.nth(1).click()
  await cards.first().click()
  await expect(page.locator('html')).toHaveAttribute('data-driving-requests', '2')
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('resolve-monitor-route', {
        detail: {
          request: 2,
          result: {
            routes: [
              {
                steps: [
                  {
                    path: [
                      { lng: 119, lat: 30 },
                      { lng: 120.123456789, lat: 30.123456789 },
                      { lng: 120.5, lat: 30.5 },
                      { lng: 120.123456789, lat: 30.123456789 },
                      { lng: 121, lat: 30 }
                    ]
                  }
                ]
              }
            ]
          }
        }
      })
    )
  )
  await expect(page.locator('html')).toHaveAttribute(
    'data-monitor-road-path',
    '[[119,30],[120.123457,30.123457],[120.5,30.5],[120.123457,30.123457],[121,30]]'
  )
  expect(errors).toEqual([])
})
