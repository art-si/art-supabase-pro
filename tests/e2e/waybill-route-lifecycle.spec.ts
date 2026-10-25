import { expect, test, type Page } from '@playwright/test'
import { mockDeferredAmapSdk } from './support/deferred-amap-sdk'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)
const errorsByPage = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  errorsByPage.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-10-22T00:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-22T00:00:01Z'))
  await page.addInitScript(() => {
    let attempts = 0
    let searches = 0
    let nativeRouteRenders = 0
    let cameraMoves = 0
    const active = new Set<number>()
    const report = () => {
      document.documentElement.dataset.activeMaps = String(active.size)
    }
    const deadlines = new Set<number>()
    const set = window.setTimeout.bind(window)
    const clear = window.clearTimeout.bind(window)
    const reportDeadlines = () => {
      document.documentElement.dataset.routeDeadlines = String(deadlines.size)
    }
    window.setTimeout = (handler, delay, ...args) => {
      if (delay !== 10_000 || typeof handler !== 'function') return set(handler, delay, ...args)
      const id = set(() => {
        deadlines.delete(id)
        reportDeadlines()
        handler(...args)
      }, delay)
      deadlines.add(id)
      reportDeadlines()
      return id
    }
    window.clearTimeout = (id) => {
      deadlines.delete(id ?? 0)
      reportDeadlines()
      clear(id)
    }
    class SdkMap {
      id: number
      constructor(private element: HTMLElement) {
        document.documentElement.dataset.nativeRouteRenders ??= '0'
        this.id = ++attempts
        document.documentElement.dataset.mapAttempts = String(attempts)
        if (!element?.isConnected) {
          document.documentElement.dataset.invalidMap = 'true'
          throw new Error('invalid map container')
        }
        if (new URLSearchParams(location.search).has('failOnce') && attempts === 1)
          throw new Error('synthetic SDK failure')
        active.add(this.id)
        report()
        element.dataset.mapInstance = String(this.id)
        element.textContent = '合成地图画布'
      }
      add(overlays: { position?: number[]; path?: number[][] } | Array<{ position?: number[] }>) {
        if (!Array.isArray(overlays) && overlays.path)
          this.element.dataset.polylinePath = JSON.stringify(overlays.path)
        if (Array.isArray(overlays))
          this.element.dataset.markerCoordinates = JSON.stringify(
            overlays.map((overlay) => overlay.position)
          )
      }
      setFitView() {
        document.documentElement.dataset.cameraMoves = String(++cameraMoves)
      }
      drawNativeRoute() {
        document.documentElement.dataset.nativeRouteRenders = String(++nativeRouteRenders)
        this.setFitView()
      }
      destroy() {
        active.delete(this.id)
        report()
        this.element.textContent = ''
      }
    }
    Object.defineProperty(window, 'AMap', {
      value: {
        Map: SdkMap,
        Marker: class {
          position: number[]
          constructor(options: { position: number[] }) {
            this.position = options.position
          }
        },
        Polyline: class {
          path: number[][]
          constructor(options: { path: number[][] }) {
            if (document.documentElement.dataset.polylineMode === 'throw')
              throw new Error('synthetic polyline failure')
            this.path = options.path
          }
        },
        Pixel: class {},
        Driving: class {
          constructor(private options: { map?: SdkMap }) {}
          clear() {}
          search(
            _origin: number[],
            _destination: number[],
            _options: object,
            callback: (status: string, result: object) => void
          ) {
            const request = ++searches
            document.documentElement.dataset.routeSearches = String(searches)
            const complete = (status: string, result?: object) => {
              if (status === 'complete') this.options.map?.drawNativeRoute()
              callback(
                status,
                result ?? {
                  routes: [
                    {
                      steps: [
                        {
                          path: [
                            { lng: _origin[0], lat: _origin[1] },
                            {
                              lng: (_origin[0] + _destination[0]) / 2 + 0.1,
                              lat: (_origin[1] + _destination[1]) / 2 - 0.1
                            },
                            { getLng: () => _destination[0], getLat: () => _destination[1] }
                          ]
                        }
                      ]
                    }
                  ]
                }
              )
            }
            const mode = document.documentElement.dataset.routeMode
            if (mode === 'throw') throw new Error('synthetic driving failure')
            if (
              mode === 'auto' ||
              (!mode && !new URLSearchParams(location.search).has('holdRoute'))
            ) {
              complete('complete')
              return
            }
            document.addEventListener('route-result', (event) => {
              const detail = (
                event as CustomEvent<{ request: number; status: string; result?: object }>
              ).detail
              if (detail.request === request) complete(detail.status, detail.result)
            })
          }
        }
      },
      configurable: true
    })
  })
  await mockDeferredAmapSdk(page)
})

test.afterEach(async ({ page }) => {
  expect(errorsByPage.get(page)).toEqual([])
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
})

test('地图失败后保留画布，重新加载恢复地图', async ({ page }, info) => {
  await page.goto('/tests/e2e/fixtures/waybill-route-lifecycle.html?failOnce', {
    waitUntil: 'domcontentloaded'
  })
  const retry = page.getByRole('button', { name: '重新加载', exact: true })
  await expect(retry).toBeVisible()
  await expect(page.locator('.waybill-route')).not.toContainText('synthetic SDK failure')
  await expect(page.getByRole('button', { name: '重新规划', exact: true })).toHaveCount(0)
  await page.clock.runFor(64)
  await expect(page.getByLabel('轨迹概览').getByText('2 个定位节点', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('route-error.png'), animations: 'disabled' })
  await retry.click()
  await expect(page.locator('.waybill-route__map-note')).toHaveClass(/is-ready/)
  await expect(page.locator('html')).toHaveAttribute('data-active-maps', '1')
  await expect(retry).toHaveCount(0)
  await page.clock.runFor(64)
  await page.screenshot({ path: info.outputPath('route-retry.png'), animations: 'disabled' })
})

test('旧路线回调不能覆盖新运单状态', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/waybill-route-lifecycle.html?holdRoute', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('html')).toHaveAttribute('data-route-searches', '1')
  await page.getByRole('button', { name: '运单二', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-route-searches', '2')
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('route-result', { detail: { request: 2, status: 'complete' } })
    )
  )
  await expect(page.locator('.waybill-route__map-note')).toHaveClass(/is-ready/)
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('route-result', { detail: { request: 1, status: 'error' } })
    )
  )
  await page.clock.runFor(32)
  await expect(page.locator('.waybill-route__map-note')).toHaveClass(/is-ready/)
})

for (const failed of [false, true]) {
  test(`旧 SDK ${failed ? '失败' : '成功'}不重建或覆盖当前地图`, async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/waybill-route-lifecycle.html?holdSdk', {
      waitUntil: 'domcontentloaded'
    })
    await expect(page.locator('html')).toHaveAttribute('data-sdk-requests', '1')
    await page.getByRole('button', { name: '运单二', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-sdk-requests', '2')
    await page.evaluate(() =>
      document.dispatchEvent(new CustomEvent('sdk-result', { detail: { request: 2 } }))
    )
    await expect(page.locator('.waybill-route__map-note')).toHaveClass(/is-ready/)
    await page.evaluate(
      (failed) =>
        document.dispatchEvent(new CustomEvent('sdk-result', { detail: { request: 1, failed } })),
      failed
    )
    await page.clock.runFor(32)
    await expect(page.locator('.waybill-route__map-note')).toHaveClass(/is-ready/)
    await expect(page.locator('html')).toHaveAttribute('data-map-attempts', '1')
    await expect(page.getByRole('button', { name: '重新加载', exact: true })).toHaveCount(0)
  })
}

test('关闭后不创建地图，并释放路线截止定时器', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/waybill-route-lifecycle.html?holdSdk', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('html')).toHaveAttribute('data-sdk-requests', '1')
  await page.getByRole('button', { name: '关闭轨迹', exact: true }).click()
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('sdk-result', { detail: { request: 1 } }))
  )
  await page.clock.runFor(32)
  await expect(page.locator('html')).not.toHaveAttribute('data-invalid-map', 'true')
  await page.goto('/tests/e2e/fixtures/waybill-route-lifecycle.html?holdRoute', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('html')).toHaveAttribute('data-route-deadlines', '1')
  await page.getByRole('button', { name: '关闭轨迹', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-route-deadlines', '0')
  await expect(page.locator('html')).toHaveAttribute('data-active-maps', '0')
})

test('空数据、同记录坐标更新和实际轨迹切换刷新地图', async ({ page }, info) => {
  await page.goto('/tests/e2e/fixtures/waybill-route-lifecycle.html?empty', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByText('暂无定位节点', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '运单一', exact: true }).click()
  await expect(page.locator('.waybill-route__map-note')).toHaveClass(/is-ready/)
  await page.getByRole('button', { name: '更新当前坐标', exact: true }).click()
  await expect(page.locator('.waybill-route__map')).toHaveAttribute(
    'data-marker-coordinates',
    '[[125,30],[126,31]]'
  )
  await page.getByRole('button', { name: '装载实际轨迹', exact: true }).click()
  await expect(page.locator('.waybill-route__map-note')).toHaveClass(/is-actual/)
  await page.clock.runFor(64)
  await expect(page.getByLabel('轨迹概览').getByText('2 个定位节点', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('route-actual.png'), animations: 'disabled' })
  const lastNode = page.locator('.waybill-route__list > li').last()
  await lastNode.scrollIntoViewIfNeeded()
  await expect(lastNode).toBeVisible()
  await page.screenshot({ path: info.outputPath('route-last-node.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '空定位运单', exact: true }).click()
  await expect(page.getByText('暂无定位节点', { exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-active-maps', '0')
})

test('路线无回调保留定位点，重新规划可恢复', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/waybill-route-lifecycle.html?holdRoute', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('html')).toHaveAttribute('data-route-searches', '1')
  await page.clock.fastForward(10_001)
  await expect(page.locator('.waybill-route__map-note')).toHaveClass(/is-unavailable/)
  await expect(page.locator('.waybill-route__map')).toBeVisible()
  await page.evaluate(() => {
    document.documentElement.dataset.routeMode = 'auto'
  })
  await page.getByRole('button', { name: '重新规划', exact: true }).click()
  await expect(page.locator('.waybill-route__map-note')).toHaveClass(/is-ready/)
})

test('实际轨迹替代规划时取消旧路线，迟到结果不改写轨迹来源', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/waybill-route-lifecycle.html?holdRoute', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('html')).toHaveAttribute('data-route-deadlines', '1')
  await page.getByRole('button', { name: '装载实际轨迹', exact: true }).click()
  await expect(page.locator('.waybill-route__map-note')).toHaveClass(/is-actual/)
  await expect(page.locator('html')).toHaveAttribute('data-route-deadlines', '0')
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('route-result', { detail: { request: 1, status: 'complete' } })
    )
  )
  await page.clock.runFor(32)
  await expect(page.locator('.waybill-route__map-note')).toHaveClass(/is-actual/)
})

test('路线服务同步抛错也释放定时器并提供恢复入口', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/waybill-route-lifecycle.html?holdSdk', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('html')).toHaveAttribute('data-sdk-requests', '1')
  await page.evaluate(() => {
    document.documentElement.dataset.routeMode = 'throw'
    document.dispatchEvent(new CustomEvent('sdk-result', { detail: { request: 1 } }))
  })
  await expect(page.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-route-deadlines', '0')
  await expect(page.locator('html')).toHaveAttribute('data-active-maps', '0')
  await expect(page.locator('.waybill-route')).not.toContainText('synthetic driving failure')
})

test('同记录仅更新备注不重建地图或重复查询路线', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/waybill-route-lifecycle.html?holdRoute', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('html')).toHaveAttribute('data-route-searches', '1')
  await page.getByRole('button', { name: '更新备注', exact: true }).click()
  await page.clock.runFor(64)
  await expect(page.locator('html')).toHaveAttribute('data-map-attempts', '1')
  await expect(page.locator('html')).toHaveAttribute('data-sdk-requests', '1')
  await expect(page.locator('html')).toHaveAttribute('data-route-searches', '1')
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('route-result', { detail: { request: 1, status: 'complete' } })
    )
  )
  await expect(page.locator('.waybill-route__map-note')).toHaveClass(/is-ready/)
})

test('超时后晚到路线不得自动绘制或改变视野，重试绘制真实道路', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/waybill-route-lifecycle.html?holdRoute', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('html')).toHaveAttribute('data-route-searches', '1')
  await page.clock.fastForward(10_001)
  await expect(page.locator('.waybill-route__map-note')).toHaveClass(/is-unavailable/)
  const cameraMoves = await page.locator('html').getAttribute('data-camera-moves')
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('route-result', {
        detail: { request: 1, status: 'complete' }
      })
    )
  )
  await page.clock.runFor(32)
  await expect(page.locator('html')).toHaveAttribute('data-native-route-renders', '0')
  await expect(page.locator('html')).toHaveAttribute('data-camera-moves', cameraMoves ?? '')
  await expect(page.locator('.waybill-route__map')).not.toHaveAttribute('data-polyline-path')
  await expect(page.locator('.waybill-route__map-note')).toHaveClass(/is-unavailable/)
  await page.evaluate(() => {
    document.documentElement.dataset.routeMode = 'auto'
  })
  await page.getByRole('button', { name: '重新规划', exact: true }).click()
  await expect(page.locator('.waybill-route__map-note')).toHaveClass(/is-ready/)
  await expect(page.locator('.waybill-route__map')).toHaveAttribute(
    'data-polyline-path',
    '[[120,30],[120.6,30.4],[121,31]]'
  )
})

for (const scenario of [
  { name: '缺少道路', result: { routes: [{}] } },
  {
    name: '无效中间坐标',
    result: {
      routes: [
        {
          steps: [
            {
              path: [
                [120, 30],
                [181, 30],
                [121, 31]
              ]
            }
          ]
        }
      ]
    }
  },
  {
    name: '零长度道路',
    result: {
      routes: [
        {
          steps: [
            {
              path: [
                [120, 30],
                [120, 30]
              ]
            }
          ]
        }
      ]
    }
  }
]) {
  test(`成功状态但${scenario.name}只显示有效定位点并允许重试`, async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/waybill-route-lifecycle.html?holdRoute', {
      waitUntil: 'domcontentloaded'
    })
    await expect(page.locator('html')).toHaveAttribute('data-route-searches', '1')
    await page.evaluate(
      (result) =>
        document.dispatchEvent(
          new CustomEvent('route-result', {
            detail: { request: 1, status: 'complete', result }
          })
        ),
      scenario.result
    )
    await expect(page.locator('.waybill-route__map-note')).toHaveClass(/is-unavailable/)
    await expect(page.locator('.waybill-route__map')).not.toHaveAttribute('data-polyline-path')
    await expect(page.locator('.waybill-route__map')).toHaveAttribute(
      'data-marker-coordinates',
      '[[120,30],[121,31]]'
    )
    await expect(page.getByRole('button', { name: '重新规划', exact: true })).toBeEnabled()
    await expect(page.locator('html')).toHaveAttribute('data-route-deadlines', '0')
  })
}

test('异步路线绘制异常会清理地图和定时器，重新加载可恢复', async ({ page }, info) => {
  await page.goto('/tests/e2e/fixtures/waybill-route-lifecycle.html?holdRoute', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('html')).toHaveAttribute('data-route-searches', '1')
  await page.evaluate(() => {
    document.documentElement.dataset.polylineMode = 'throw'
    document.dispatchEvent(
      new CustomEvent('route-result', { detail: { request: 1, status: 'complete' } })
    )
  })
  const retry = page.getByRole('button', { name: '重新加载', exact: true })
  await expect(retry).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-active-maps', '0')
  await expect(page.locator('html')).toHaveAttribute('data-route-deadlines', '0')
  await page.evaluate(() => {
    document.documentElement.dataset.polylineMode = ''
    document.documentElement.dataset.routeMode = 'auto'
  })
  await retry.click()
  await expect(page.locator('.waybill-route__map-note')).toHaveClass(/is-ready/)
  await page.clock.runFor(64)
  await page.screenshot({
    path: info.outputPath('route-current-paint.png'),
    animations: 'disabled'
  })
})
