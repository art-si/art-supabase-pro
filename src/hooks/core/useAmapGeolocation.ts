import type { MaybeRefOrGetter } from 'vue'
import { useAmapSdk } from './useAmapSdk'
import { withTimeout } from '@/utils/async'
import { normalizeAmapCoordinate } from '@/utils/amap'
import { isPlainObjectRecord } from '@/utils/type-guards'

export interface AmapLocationAddressComponent {
  province?: string
  city?: string | string[]
  district?: string
  adcode?: string
}

export interface AmapDeviceLocation {
  longitude: number
  latitude: number
  accuracy: number | null
  formattedAddress: string
  addressComponent?: AmapLocationAddressComponent
}

interface AmapLocationNamespace extends ArtAmapBrowserNamespace {
  Geolocation: new (options: Record<string, unknown>) => {
    getCurrentPosition: (callback: (status: string, result: unknown) => void) => void
  }
}

interface AmapGeolocationOptions {
  key?: MaybeRefOrGetter<string | undefined>
  securityJsCode?: MaybeRefOrGetter<string | undefined>
  timeoutMs?: number
}

/** One cancellable, bounded SDK boundary for device location in forms and business dialogs. */
export function useAmapGeolocation(options: AmapGeolocationOptions = {}) {
  const timeoutMs = options.timeoutMs ?? 12_000
  const { loadAmap } = useAmapSdk<AmapLocationNamespace>({
    key: options.key ?? import.meta.env.VITE_AMAP_KEY,
    securityJsCode: options.securityJsCode ?? import.meta.env.VITE_AMAP_SECURITY_JS_CODE,
    plugins: ['AMap.Geolocation']
  })

  function getCurrentLocation(signal?: AbortSignal): Promise<AmapDeviceLocation> {
    let active = true
    const ensureActive = () => {
      if (!active || signal?.aborted)
        throw signal?.reason ?? new DOMException('定位已结束', 'AbortError')
    }
    const task = (async () => {
      if (
        !window.isSecureContext &&
        !['localhost', '127.0.0.1'].includes(window.location.hostname)
      ) {
        throw new Error('浏览器仅允许在 HTTPS 页面使用精确定位')
      }
      ensureActive()
      const amap = await loadAmap()
      ensureActive()
      return new Promise<AmapDeviceLocation>((resolve, reject) => {
        const geolocation = new amap.Geolocation({
          convert: true,
          enableHighAccuracy: true,
          extensions: 'all',
          needAddress: true,
          showButton: false,
          showCircle: false,
          showMarker: false,
          timeout: timeoutMs
        })
        geolocation.getCurrentPosition((status, result) => {
          try {
            ensureActive()
            if (status !== 'complete')
              throw new Error(locationErrorMessage(result), { cause: result })
            resolve(readDeviceLocation(result))
          } catch (error) {
            reject(error)
          }
        })
      })
    })()
    return withTimeout(
      task,
      timeoutMs,
      '定位超时，请移动到信号较好的位置后重试，或改用地图选点',
      signal
    ).finally(() => {
      active = false
    })
  }

  return { getCurrentLocation }
}

function locationErrorMessage(result: unknown): string {
  const value = isPlainObjectRecord(result) ? result.message || result.info : result
  const message = typeof value === 'string' ? value : ''
  if (/permission|denied|拒绝|权限/i.test(message)) {
    return '定位权限未开启，请在浏览器设置中允许访问位置，或改用地图选点'
  }
  if (/timeout|超时/i.test(message)) {
    return '定位超时，请移动到信号较好的位置后重试，或改用地图选点'
  }
  return '暂时无法获取当前位置，请重试或改用地图选点'
}

function readDeviceLocation(result: unknown): AmapDeviceLocation {
  const position = isPlainObjectRecord(result) ? result.position : undefined
  if (!position || typeof position !== 'object') {
    throw new Error('定位结果缺少有效经纬度，请重试或改用地图选点', { cause: result })
  }
  const pair = normalizeAmapCoordinate(position)
  if (!pair || !isPlainObjectRecord(result)) {
    throw new Error('定位结果缺少有效经纬度，请重试或改用地图选点', { cause: result })
  }
  const address = isPlainObjectRecord(result.addressComponent) ? result.addressComponent : {}
  return {
    ...pair,
    accuracy:
      typeof result.accuracy === 'number' &&
      Number.isFinite(result.accuracy) &&
      result.accuracy >= 0
        ? result.accuracy
        : null,
    formattedAddress:
      typeof result.formattedAddress === 'string' ? result.formattedAddress.trim() : '',
    addressComponent: {
      province: typeof address.province === 'string' ? address.province : undefined,
      city:
        typeof address.city === 'string'
          ? address.city
          : Array.isArray(address.city)
            ? address.city.filter((item): item is string => typeof item === 'string')
            : undefined,
      district: typeof address.district === 'string' ? address.district : undefined,
      adcode: typeof address.adcode === 'string' ? address.adcode : undefined
    }
  }
}
