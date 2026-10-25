import { normalizeNullableNumber } from './form/normalize'

export interface CoordinatePair {
  longitude: number
  latitude: number
}

/** Parse a complete geographic position without coercing missing values to zero. */
export function normalizeCoordinatePair(
  longitude: unknown,
  latitude: unknown
): CoordinatePair | null {
  const lng = normalizeNullableNumber(longitude)
  const lat = normalizeNullableNumber(latitude)
  if (lng === null || lat === null || Math.abs(lng) > 180 || Math.abs(lat) > 90) return null
  return { longitude: lng, latitude: lat }
}
