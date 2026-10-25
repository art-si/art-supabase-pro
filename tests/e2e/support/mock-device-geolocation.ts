import type { Page } from '@playwright/test'
import { mockDeferredAmapSdk } from './deferred-amap-sdk'

export async function mockDeviceGeolocation(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let requests = 0
    Object.defineProperty(window, 'AMap', {
      value: {
        Geolocation: class {
          getCurrentPosition(callback: (status: string, value: object) => void) {
            const request = ++requests
            document.documentElement.dataset.locationRequests = String(requests)
            document.addEventListener('device-location-result', (event) => {
              const detail = (
                event as CustomEvent<{
                  request: number
                  failed?: boolean
                  message?: string
                  lng?: number
                  lat?: number
                }>
              ).detail
              if (detail.request !== request) return
              const lng = detail.lng ?? 120.123456789
              const lat = detail.lat ?? 30.123456789
              callback(detail.failed ? 'error' : 'complete', {
                message: detail.message,
                position: { lng, lat, getLng: () => lng, getLat: () => lat },
                accuracy: 8,
                formattedAddress: '合成当前位置',
                addressComponent: {
                  province: '上海',
                  city: '上海',
                  district: '浦东新区',
                  adcode: '310115'
                }
              })
            })
          }
        }
      },
      configurable: true
    })
  })
  await mockDeferredAmapSdk(page)
}
