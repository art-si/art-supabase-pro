import { getDictionaryDisplayLabel } from '@/utils/form/option'

export function formatVehicleTypeMetric(value: number | null | undefined, unit: string): string {
  return value == null ? '未配置' : `${value} ${unit}`
}

export function vehicleTypeProfileLabel(profile: {
  category: string
  lengthM: number | null
  loadTons: number | null
}): string {
  const byLoad = profile.category === '按载重'
  const value = byLoad ? profile.loadTons : profile.lengthM
  return value == null
    ? profile.category
    : `${profile.category} · ${formatVehicleTypeMetric(value, byLoad ? '吨' : '米')}`
}

/** Preserve older Chinese vehicle names without exposing mixed dictionary codes. */
export function getVehicleTypeFallbackLabel(
  value?: string | null,
  options: { emptyText?: string; unknownText?: string } = {}
): string {
  const label = value?.trim()
  if (!label) return options.emptyText ?? '--'
  return /[\u3400-\u9fff]/u.test(label) && /^[\u3400-\u9fff0-9\s·（）().、/－-]+$/u.test(label)
    ? label
    : (options.unknownText ?? '未识别')
}

/** Resolve dictionary values and keep historical human-readable names. */
export function formatVehicleTypeDisplay(
  value: unknown,
  item?: { label?: string; name?: string }
): string {
  return getDictionaryDisplayLabel(item, value, {
    unknownText: getVehicleTypeFallbackLabel(
      typeof value === 'string' ? value : String(value ?? ''),
      { unknownText: '待核对' }
    )
  })
}
