import { normalizeCoordinatePair } from '@/utils/geo'
import { isMaskedValue } from '@/utils/field-permission'
import { formatNumberValue } from './format'

export interface CoordinateValueFormatOptions {
  emptyText?: string
  fractionDigits?: number
}

/** Display a complete coordinate pair without turning missing or protected values into zero. */
export function formatCoordinateValue(
  longitude: unknown,
  latitude: unknown,
  options: CoordinateValueFormatOptions = {}
): string {
  if (isMaskedValue(longitude)) return longitude.trim()
  if (isMaskedValue(latitude)) return latitude.trim()
  const pair = normalizeCoordinatePair(longitude, latitude)
  if (!pair) return options.emptyText ?? '--'
  const { longitude: lng, latitude: lat } = pair
  if (options.fractionDigits === undefined) return `${lng}, ${lat}`
  const numberFormat: Intl.NumberFormatOptions = {
    useGrouping: false,
    minimumFractionDigits: options.fractionDigits,
    maximumFractionDigits: options.fractionDigits
  }
  return `${formatNumberValue(lng, 'zh-CN', numberFormat)}, ${formatNumberValue(lat, 'zh-CN', numberFormat)}`
}
