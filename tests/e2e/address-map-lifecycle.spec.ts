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
    const active = new Set<number>()
    const report = () => {
      document.documentElement.dataset.activeMaps = String(active.size)
    }
    class SdkMap {
      id = ++count
      listeners: Array<() => void> = []
      constructor(private element: HTMLElement) {
        active.add(this.id)
        report()
        document.documentElement.dataset.mapAttempts = String(count)
        element.textContent = '合成地址选点地图'
      }
      addControl() {}
      add() {}
      resize() {}
      setCenter() {}
      setZoomAndCenter() {}
      on(name: string, callback: (event: object) => void) {
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
      search(_keyword: string, callback: (status: string, result: object) => void) {
        const request = ++search
        document.documentElement.dataset.poiSearches = String(search)
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
        },
        Scale: class {},
        ToolBar: class {},
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
