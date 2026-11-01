import { expect, test } from '@playwright/test'
import { mockDeferredAmapSdk } from './support/deferred-amap-sdk'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

test.beforeEach(async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.clock.install()
  await page.addInitScript(() => {
    let count = 0
    let search = 0
    let geocode = 0
    let locations = 0
    let deviceLocations = 0
    const active = new Set<number>()
    const report = () => {
      document.documentElement.dataset.activeMaps = String(active.size)
    }
    class SdkMap {
      id = ++count
      listeners: Array<() => void> = []
      constructor(
        private element: HTMLElement,
        options: { center?: number[] }
      ) {
        active.add(this.id)
        report()
        document.documentElement.dataset.mapAttempts = String(count)
        document.documentElement.dataset.initialMapCenter = JSON.stringify(options.center ?? null)
        document.documentElement.dataset.mapCenter = JSON.stringify(options.center ?? null)
        element.textContent = '合成地址选点地图'
      }
      addControl() {}
      add() {}
      resize() {}
      setCenter(center: number[]) {
        document.documentElement.dataset.mapCenter = JSON.stringify(center)
      }
      setZoomAndCenter(_zoom: number, center: number[]) {
        this.setCenter(center)
      }
      on(name: string, callback: (event: object) => void) {
        if (name === 'dragstart' || name === 'zoomstart') {
          const listener = () => callback({ originEvent: new Event(name) })
          document.addEventListener(`map-${name}`, listener)
          this.listeners.push(() => document.removeEventListener(`map-${name}`, listener))
          return
        }
        if (name !== 'click') return
        const listener = (event: Event) => callback({ lnglat: (event as CustomEvent).detail })
        document.addEventListener('map-click', listener)
        this.listeners.push(() => document.removeEventListener('map-click', listener))
      }
      destroy() {
        this.listeners.forEach((stop) => stop())
        active.delete(this.id)
        report()
        this.element.textContent = ''
      }
    }
    class Search {
      clear() {}
      setCity() {}
      search(keyword: string, callback: (status: string, result: object) => void) {
        const request = ++search
        document.documentElement.dataset.poiSearches = String(search)
        document.documentElement.dataset.poiKeyword = keyword
        document.addEventListener('poi-result', (event) => {
          const detail = (
            event as CustomEvent<{
              request: number
              name: string
              location?: { lng: number; lat: number } | null
            }>
          ).detail
          if (detail.request === request)
            callback('complete', {
              tips: [
                {
                  id: String(request),
                  name: detail.name,
                  adcode: '310000',
                  district: '上海',
                  location: detail.location === undefined ? { lng: 120, lat: 30 } : detail.location
                }
              ]
            })
        })
      }
    }
    Object.defineProperty(window, 'AMap', {
      value: {
        Map: SdkMap,
        Marker: class {
          setPosition() {}
          setContent() {}
          setzIndex() {}
        },
        Pixel: class {},
        Scale: class {},
        ToolBar: class {},
        Driving: class {},
        Geolocation: class {
          getCurrentPosition(callback: (status: string, result: object) => void) {
            const request = ++deviceLocations
            document.documentElement.dataset.deviceLocationRequests = String(request)
            document.addEventListener('device-location-result', (event) => {
              const detail = (
                event as CustomEvent<{
                  request: number
                  denied?: boolean
                  lng?: number
                  lat?: number
                }>
              ).detail
              if (detail.request !== request) return
              callback(
                detail.denied ? 'error' : 'complete',
                detail.denied
                  ? { message: 'permission denied' }
                  : {
                      position: { lng: detail.lng ?? 113.3, lat: detail.lat ?? 23.1 },
                      formattedAddress: '合成设备位置，不应回填地址'
                    }
              )
            })
          }
        },
        PlaceSearch: Search,
        AutoComplete: Search,
        DistrictSearch: class {
          setLevel() {}
        },
        Geocoder: class {
          setCity() {}
          getLocation(_address: string, callback: (status: string, result: object) => void) {
            const request = ++locations
            document.documentElement.dataset.locationRequests = String(locations)
            document.addEventListener('location-result', (event) => {
              const detail = (
                event as CustomEvent<{
                  request: number
                  location?: { lng: number; lat: number }
                  info?: string
                }>
              ).detail
              if (detail.request === request)
                callback('complete', {
                  info: detail.info,
                  geocodes: [{ location: detail.location ?? { lng: 120, lat: 30 } }]
                })
            })
          }
          getAddress(_point: number[], callback: (status: string, result: object) => void) {
            const request = ++geocode
            document.documentElement.dataset.geocodeRequests = String(geocode)
            document.addEventListener('geocode-result', (event) => {
              const detail = (event as CustomEvent<{ request: number; name: string }>).detail
              if (detail.request === request)
                callback('complete', {
                  regeocode: {
                    formattedAddress: detail.name,
                    addressComponent: {
                      province: '上海',
                      city: '上海',
                      district: '浦东新区',
                      adcode: '310115'
                    }
                  }
                })
            })
          }
        }
      },
      configurable: true
    })
  })
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await mockDeferredAmapSdk(page)
})

test('关闭地址弹窗后，晚到 SDK 不创建隐藏地图', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/picker-overlay-state.html?mode=address&holdSdk', {
    waitUntil: 'domcontentloaded'
  })
  const dialog = page.getByRole('dialog', { name: '选择地址' })
  await page.getByRole('button', { name: '打开选择器', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-sdk-requests', '1')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.clock.runFor(400)
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('sdk-result', { detail: { request: 1 } }))
  )
  await page.clock.runFor(32)
  await expect(page.locator('html')).not.toHaveAttribute('data-map-attempts')
  await page.getByRole('button', { name: '打开选择器', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-sdk-requests', '2')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('sdk-result', { detail: { request: 2 } }))
  )
  await expect(page.locator('html')).toHaveAttribute('data-active-maps', '1')
})

test('空白地址地图以当前位置作为视野且不回填业务地址坐标', async ({ page }, info) => {
  await page.goto('/tests/e2e/fixtures/picker-overlay-state.html?mode=address')
  await page.getByRole('button', { name: '打开选择器', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-device-location-requests', '1')
  await expect(page.locator('html')).toHaveAttribute('data-initial-map-center', 'null')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 1 } }))
  )
  await expect(page.locator('html')).toHaveAttribute('data-map-center', '[113.3,23.1]')
  await expect(page.getByLabel('已保存地址数据')).toHaveText(
    '{"address":"","longitude":null,"latitude":null}'
  )
  const dialog = page.getByRole('dialog', { name: '选择地址' })
  await expect(dialog.getByRole('button', { name: '保存地址', exact: true })).toBeDisabled()
  await page.screenshot({ path: info.outputPath('current-location-view.png'), fullPage: true })
})

test('已保存业务坐标优先回显，不申请当前位置也不覆盖原地址', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/picker-overlay-state.html?mode=address&seedCoordinate')
  await page.getByRole('button', { name: '打开选择器', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-initial-map-center', '[121.5,31.2]')
  await expect(page.locator('html')).not.toHaveAttribute('data-device-location-requests')
  await expect(page.getByLabel('已保存地址数据')).toHaveText(
    '{"address":"已保存的合成业务地址","longitude":121.5,"latitude":31.2}'
  )
})

test('定位拒绝后可继续地图选点，迟到定位不能覆盖手动选点', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/picker-overlay-state.html?mode=address')
  await page.getByRole('button', { name: '打开选择器', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-device-location-requests', '1')
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('device-location-result', { detail: { request: 1, denied: true } })
    )
  )
  const dialog = page.getByRole('dialog', { name: '选择地址' })
  await expect(dialog.locator('.art-address-map__message')).toContainText('定位权限未开启')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '打开选择器', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-device-location-requests', '2')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('map-click', { detail: { lng: 118, lat: 28 } }))
  )
  await expect(page.locator('html')).toHaveAttribute('data-geocode-requests', '1')
  await page.evaluate(() => {
    document.dispatchEvent(
      new CustomEvent('geocode-result', { detail: { request: 1, name: '合成手动选点地址' } })
    )
    document.dispatchEvent(
      new CustomEvent('device-location-result', { detail: { request: 2, lng: 113, lat: 23 } })
    )
  })
  await expect(page.locator('html')).toHaveAttribute('data-map-center', '[118,28]')
  await expect(dialog.getByRole('button', { name: '保存地址', exact: true })).toBeEnabled()
  await expect(page.getByLabel('已保存地址数据')).toHaveText(
    '{"address":"","longitude":null,"latitude":null}'
  )
})

test('关闭重开后旧定位和用户拖拽后的定位均不抢当前地图视野', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/picker-overlay-state.html?mode=address')
  await page.getByRole('button', { name: '打开选择器', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-device-location-requests', '1')
  const dialog = page.getByRole('dialog', { name: '选择地址' })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '打开选择器', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-device-location-requests', '2')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 1 } }))
  )
  await page.clock.runFor(32)
  await expect(page.locator('html')).toHaveAttribute('data-map-center', 'null')
  await page.evaluate(() => {
    document.dispatchEvent(new Event('map-dragstart'))
    document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 2 } }))
  })
  await page.clock.runFor(32)
  await expect(page.locator('html')).toHaveAttribute('data-map-center', 'null')
  expect(errors).toEqual([])
})

test('空数据在途地图默认定位当前视野，拖拽后不受迟到定位影响', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/tms-monitor-date-format.html?root')
  await expect(page.locator('html')).toHaveAttribute('data-device-location-requests', '1')
  await expect(page.locator('html')).toHaveAttribute('data-initial-map-center', 'null')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 1 } }))
  )
  await expect(page.locator('html')).toHaveAttribute('data-map-center', '[113.3,23.1]')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-device-location-requests', '1')
  await page.evaluate(() => {
    document.dispatchEvent(new Event('map-dragstart'))
    document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 1 } }))
  })
  await page.clock.runFor(32)
  await expect(page.locator('html')).toHaveAttribute('data-map-center', 'null')
})

test('卸载地址选择器后晚到定位不重建地图或产生错误', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/picker-overlay-state.html?mode=address')
  await page.getByRole('button', { name: '打开选择器', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-device-location-requests', '1')
  await page
    .getByRole('button', { name: '卸载地址选择器', exact: true })
    .evaluate((element: HTMLButtonElement) => element.click())
  await expect(page.locator('html')).toHaveAttribute('data-active-maps', '0')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 1 } }))
  )
  await page.clock.runFor(32)
  await expect(page.getByRole('dialog', { name: '选择地址' })).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-map-center', 'null')
  expect(errors).toEqual([])
})

test('在途业务坐标到达后优先显示车辆位置，当前位置不能覆盖', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/rpc/tms_list_waybills_secure', (route) =>
    route.fulfill({
      json: {
        records: [
          {
            id: 'synthetic-location-waybill',
            waybillNo: '合成定位运单',
            status: 'transporting',
            currentLongitude: 120,
            currentLatitude: 30,
            vehicle: { id: 'synthetic-location-vehicle', plateNo: '合成车辆' }
          }
        ],
        total: 1
      }
    })
  )
  await page.route('**/rest/v1/rpc/tms_list_orders_secure', (route) =>
    route.fulfill({ json: { records: [], total: 0 } })
  )
  await page.goto('/tests/e2e/fixtures/tms-monitor-date-format.html?root')
  await expect(page.locator('.vehicle-card')).toHaveCount(1)
  await expect(page.locator('html')).toHaveAttribute('data-map-center', '[120,30]')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 1 } }))
  )
  await page.clock.runFor(32)
  await expect(page.locator('html')).toHaveAttribute('data-map-center', '[120,30]')
  expect(errors).toEqual([])
})

test('重新打开后的地图不显示旧 SDK 失败反馈', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/picker-overlay-state.html?mode=address&holdSdk', {
    waitUntil: 'domcontentloaded'
  })
  const dialog = page.getByRole('dialog', { name: '选择地址' })
  await page.getByRole('button', { name: '打开选择器', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-sdk-requests', '1')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '打开选择器', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-sdk-requests', '2')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('sdk-result', { detail: { request: 2 } }))
  )
  await expect(page.locator('html')).toHaveAttribute('data-active-maps', '1')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('sdk-result', { detail: { request: 1, failed: true } }))
  )
  await page.clock.runFor(32)
  await expect(dialog.locator('.art-address-map__message')).toHaveCount(0)
})

test('改词和清空搜索立即隔离旧候选结果', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/picker-overlay-state.html?mode=address', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开选择器', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '选择地址' })
  await expect(page.locator('html')).toHaveAttribute('data-active-maps', '1')
  const input = dialog.getByPlaceholder('搜索地点、园区、道路、仓库名称')
  await input.fill('旧仓库')
  await page.clock.runFor(400)
  await expect(page.locator('html')).toHaveAttribute('data-poi-searches', '1')
  await input.fill('新仓库')
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('poi-result', { detail: { request: 1, name: '旧仓库候选' } })
    )
  )
  await page.clock.runFor(32)
  await expect(dialog.getByRole('button', { name: /旧仓库候选/ })).toHaveCount(0)
  await page.clock.runFor(400)
  await expect(page.locator('html')).toHaveAttribute('data-poi-searches', '2')
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('poi-result', { detail: { request: 2, name: '新仓库候选' } })
    )
  )
  await expect(dialog.getByRole('button', { name: /新仓库候选/ })).toBeVisible()
  await input.fill('待清空仓库')
  await page.clock.runFor(400)
  await expect(page.locator('html')).toHaveAttribute('data-poi-searches', '3')
  await input.fill('')
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('poi-result', { detail: { request: 3, name: '清空前候选' } })
    )
  )
  await page.clock.runFor(32)
  await expect(dialog.locator('.art-address-map__poi')).toHaveCount(0)
})

test('父级v-model同一事件循环改词后自动搜索最新关键词并保存POI', async ({ page }, info) => {
  await page.goto('/tests/e2e/fixtures/picker-overlay-state.html?mode=address', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开选择器', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '选择地址' })
  await expect(page.locator('html')).toHaveAttribute('data-active-maps', '1')
  const input = dialog.getByPlaceholder('搜索地点、园区、道路、仓库名称')
  await input.evaluate((element: HTMLInputElement) => {
    element.value = '首次关键词'
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.value = '自动搜索仓库'
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.clock.runFor(400)
  await expect(page.locator('html')).toHaveAttribute('data-poi-searches', '1')
  await expect(page.locator('html')).toHaveAttribute('data-poi-keyword', '自动搜索仓库')
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('poi-result', { detail: { request: 1, name: '自动搜索仓库' } })
    )
  )
  await dialog.getByRole('button', { name: /自动搜索仓库/ }).click()
  await expect(dialog.locator('.art-address-picker-map__selected strong')).toHaveText(
    '自动搜索仓库'
  )
  await page.screenshot({
    path: info.outputPath('automatic-poi-search.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '保存地址', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(
    page.getByPlaceholder('请输入道路、门牌号、小区、楼栋等，或点击地图选择')
  ).toHaveValue('自动搜索仓库')
})

test('地图只保存最新选点，跨弹窗旧地理编码不能回填', async ({ page }, info) => {
  await page.goto('/tests/e2e/fixtures/picker-overlay-state.html?mode=address', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开选择器', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '选择地址' })
  await expect(page.locator('html')).toHaveAttribute('data-active-maps', '1')
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('map-click', { detail: { lng: 120, lat: 30 } }))
    document.dispatchEvent(new CustomEvent('map-click', { detail: { lng: 121, lat: 31 } }))
    document.dispatchEvent(
      new CustomEvent('geocode-result', { detail: { request: 2, name: '最新选点地址' } })
    )
  })
  const selected = dialog.locator('.art-address-picker-map__selected strong')
  await expect(selected).toHaveText('最新选点地址')
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('geocode-result', { detail: { request: 1, name: '旧选点地址' } })
    )
  )
  await page.clock.runFor(32)
  await expect(selected).toHaveText('最新选点地址')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('map-click', { detail: { lng: 122, lat: 32 } }))
  )
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '打开选择器', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-map-attempts', '2')
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('geocode-result', { detail: { request: 3, name: '过期会话地址' } })
    )
  )
  await page.clock.runFor(32)
  await expect(selected).toHaveText('请搜索或点击地图选择地址')
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('map-click', { detail: { lng: 123, lat: 33 } }))
    document.dispatchEvent(
      new CustomEvent('geocode-result', { detail: { request: 4, name: '当前会话地址' } })
    )
  })
  await expect(selected).toHaveText('当前会话地址')
  await page.screenshot({
    path: info.outputPath('address-latest-pick.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '保存地址', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(
    page.getByPlaceholder('请输入道路、门牌号、小区、楼栋等，或点击地图选择')
  ).toHaveValue('当前会话地址')
})

test('非法 SDK 坐标不会进入选点或保存状态', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/picker-overlay-state.html?mode=address', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开选择器', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '选择地址' })
  await expect(page.locator('html')).toHaveAttribute('data-active-maps', '1')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('map-click', { detail: { lng: 200, lat: 100 } }))
  )
  await page.clock.runFor(32)
  await expect(page.locator('html')).not.toHaveAttribute('data-geocode-requests')
  await expect(dialog.getByRole('button', { name: '保存地址', exact: true })).toBeDisabled()
})

for (const invalid of [false, true]) {
  test(`候选地址解析${invalid ? '拒绝非法坐标并显示可操作反馈' : '晚到时不覆盖最新地图选点'}`, async ({
    page
  }) => {
    await page.goto('/tests/e2e/fixtures/picker-overlay-state.html?mode=address', {
      waitUntil: 'domcontentloaded'
    })
    await page.getByRole('button', { name: '打开选择器', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '选择地址' })
    await expect(page.locator('html')).toHaveAttribute('data-active-maps', '1')
    await dialog.getByPlaceholder('搜索地点、园区、道路、仓库名称').fill('待解析仓库')
    await page.clock.runFor(400)
    await expect(page.locator('html')).toHaveAttribute('data-poi-searches', '1')
    await page.evaluate(() =>
      document.dispatchEvent(
        new CustomEvent('poi-result', {
          detail: { request: 1, name: '无坐标候选', location: null }
        })
      )
    )
    await dialog.getByRole('button', { name: /无坐标候选/ }).click()
    await expect(page.locator('html')).toHaveAttribute('data-location-requests', '1')
    if (invalid) {
      await page.evaluate(() =>
        document.dispatchEvent(
          new CustomEvent('location-result', {
            detail: { request: 1, location: { lng: 200, lat: 100 }, info: 'INVALID_USER_KEY' }
          })
        )
      )
      await expect(page.locator('.el-message--warning')).toContainText(
        '地址解析失败，请重新搜索或点击地图选点'
      )
      await expect(page.locator('.el-message--warning')).not.toContainText('INVALID_USER_KEY')
      await expect(dialog.getByRole('button', { name: '保存地址', exact: true })).toBeDisabled()
    } else {
      await page.evaluate(() => {
        document.dispatchEvent(new CustomEvent('map-click', { detail: { lng: 123, lat: 33 } }))
        document.dispatchEvent(
          new CustomEvent('geocode-result', { detail: { request: 1, name: '新的地图选点' } })
        )
        document.dispatchEvent(new CustomEvent('location-result', { detail: { request: 1 } }))
      })
      await page.clock.runFor(32)
      await expect(dialog.locator('.art-address-picker-map__selected strong')).toHaveText(
        '新的地图选点'
      )
    }
  })
}
