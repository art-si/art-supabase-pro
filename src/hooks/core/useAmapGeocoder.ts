import { round, trim } from 'lodash-es'
import { normalizeAmapCoordinate } from '@/utils/amap'
import { withTimeout } from '@/utils/async'
import { useAmapSdk } from './useAmapSdk'

interface AMapGeocodeResult {
  geocodes?: Array<{
    location?: unknown
  }>
}

interface AMapGeocoderInstance {
  getLocation: (
    address: string,
    callback: (status: string, result: AMapGeocodeResult) => void
  ) => void
}

interface AMapConstructor extends ArtAmapBrowserNamespace {
  Geocoder: new (options: { city: string }) => AMapGeocoderInstance
}

export interface AmapGeocodeLocation {
  longitude: number
  latitude: number
}

const GEOCODE_TIMEOUT_MS = 10_000

/**
 * Converts a text address to a GCJ-02 coordinate through the AMap browser SDK.
 * An empty/no-result address resolves to null; SDK configuration and load errors reject.
 */
export function useAmapGeocoder() {
  const { loadAmap } = useAmapSdk<AMapConstructor>({
    key: () => import.meta.env.VITE_AMAP_KEY,
    plugins: ['AMap.Geocoder'],
    securityJsCode: () => import.meta.env.VITE_AMAP_SECURITY_JS_CODE
  })

  async function geocodeAddress(
    address: string,
    city = '全国'
  ): Promise<AmapGeocodeLocation | null> {
    const normalizedAddress = trim(address)
    if (!normalizedAddress) return null

    const AMap = await loadAmap()
    const geocoder = new AMap.Geocoder({ city: trim(city) || '全国' })

    return withTimeout(
      new Promise<AmapGeocodeLocation | null>((resolve) => {
        geocoder.getLocation(normalizedAddress, (status, result) => {
          if (status !== 'complete') {
            resolve(null)
            return
          }

          const location = result?.geocodes?.[0]?.location
          const pair = normalizeAmapCoordinate(location)
          if (!pair) {
            resolve(null)
            return
          }

          resolve({
            longitude: round(pair.longitude, 6),
            latitude: round(pair.latitude, 6)
          })
        })
      }),
      GEOCODE_TIMEOUT_MS,
      '地址解析超时，请稍后重试'
    )
  }

  return { geocodeAddress }
}
