import { normalizeCoordinatePair, type CoordinatePair } from './geo'
import { isPlainObjectRecord } from './type-guards'

/** Accept documented LngLat instances, data objects and coordinate tuples at the SDK boundary. */
export function normalizeAmapCoordinate(value: unknown): CoordinatePair | null {
  try {
    if (Array.isArray(value)) return normalizeCoordinatePair(value[0], value[1])
    if (!value || typeof value !== 'object') return null
    const longitude =
      'getLng' in value && typeof value.getLng === 'function'
        ? value.getLng()
        : 'lng' in value
          ? value.lng
          : undefined
    const latitude =
      'getLat' in value && typeof value.getLat === 'function'
        ? value.getLat()
        : 'lat' in value
          ? value.lat
          : undefined
    return normalizeCoordinatePair(longitude, latitude)
  } catch {
    // Malformed SDK accessors are invalid data, just like missing/out-of-range coordinates.
    return null
  }
}

/** Reject incomplete roads instead of joining across malformed geometry or inventing a straight line. */
export function readAmapDrivingPath(result: unknown): Array<[number, number]> {
  try {
    if (!isPlainObjectRecord(result) || !Array.isArray(result.routes)) return []
    const route = result.routes[0]
    if (!isPlainObjectRecord(route) || !Array.isArray(route.steps)) return []
    const path: Array<[number, number]> = []
    for (const step of route.steps) {
      if (!isPlainObjectRecord(step) || !Array.isArray(step.path)) return []
      for (const point of step.path) {
        const coordinate = normalizeAmapCoordinate(point)
        if (!coordinate) return []
        path.push([coordinate.longitude, coordinate.latitude])
      }
    }
    return path.length > 1 && path.some(([lng, lat]) => lng !== path[0][0] || lat !== path[0][1])
      ? path
      : []
  } catch {
    return []
  }
}
