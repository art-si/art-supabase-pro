import { useAmapSdk } from './useAmapSdk'
import { withTimeout } from '@/utils/async'

export interface AmapRouteCoordinate {
  longitude: number
  latitude: number
}

export interface AmapDrivingEstimate {
  distanceKm: number
  estimatedMinutes: number
}

interface AmapDrivingRoute {
  distance?: number
  time?: number
}

interface AmapDrivingResult {
  routes?: AmapDrivingRoute[]
}

interface AmapDrivingInstance {
  search(
    origin: [number, number],
    destination: [number, number],
    callback: (status: string, result: AmapDrivingResult | unknown) => void
  ): void
  search(
    origin: [number, number],
    destination: [number, number],
    options: { waypoints: Array<[number, number]> },
    callback: (status: string, result: AmapDrivingResult | unknown) => void
  ): void
}

interface AmapDrivingNamespace extends ArtAmapBrowserNamespace {
  Driving: new (options: Record<string, unknown>) => AmapDrivingInstance
  DrivingPolicy?: { LEAST_TIME?: number }
}

const ROUTE_ESTIMATE_TIMEOUT_MS = 10_000

/** Returns AMap's fastest-route estimate through ordered GCJ-02 endpoints and waypoints. */
export function useAmapDrivingEstimate() {
  const { loadAmap } = useAmapSdk<AmapDrivingNamespace>({
    key: import.meta.env.VITE_AMAP_KEY,
    securityJsCode: import.meta.env.VITE_AMAP_SECURITY_JS_CODE,
    plugins: ['AMap.Driving']
  })

  async function estimateDrivingRoute(
    origin: AmapRouteCoordinate,
    destination: AmapRouteCoordinate,
    waypoints: AmapRouteCoordinate[] = []
  ): Promise<AmapDrivingEstimate> {
    const amap = await loadAmap()
    const driving = new amap.Driving({
      policy: amap.DrivingPolicy?.LEAST_TIME ?? 0,
      extensions: 'base'
    })

    return withTimeout(
      new Promise<AmapDrivingEstimate>((resolve, reject) => {
        const onResult = (status: string, result: AmapDrivingResult | unknown): void => {
          if (status !== 'complete' || !isDrivingResult(result)) {
            reject(new Error('未获取到可用的驾车路线'))
            return
          }

          const route = result.routes?.[0]
          const distanceMeters = Number(route?.distance)
          const durationSeconds = Number(route?.time)
          if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) {
            reject(new Error('路线估算结果不完整'))
            return
          }

          resolve({
            distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
            estimatedMinutes: Math.max(1, Math.ceil(durationSeconds / 60))
          })
        }
        const start: [number, number] = [origin.longitude, origin.latitude]
        const end: [number, number] = [destination.longitude, destination.latitude]
        if (waypoints.length) {
          driving.search(
            start,
            end,
            {
              waypoints: waypoints.map((point): [number, number] => [
                point.longitude,
                point.latitude
              ])
            },
            onResult
          )
        } else driving.search(start, end, onResult)
      }),
      ROUTE_ESTIMATE_TIMEOUT_MS,
      '路线估算超时'
    )
  }

  return { estimateDrivingRoute }
}

function isDrivingResult(result: unknown): result is AmapDrivingResult {
  return Boolean(result && typeof result === 'object' && 'routes' in result)
}
