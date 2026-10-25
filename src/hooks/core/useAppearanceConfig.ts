import { SETTING_DEFAULT_CONFIG } from '@/config/setting'
import { fetchSystemParamByKey, editSystemParam } from '@/api/system-manage/system-param'
import { useSettingStore } from '@/store/modules/setting'
import { useTheme } from '@/hooks/core/useTheme'
import { clearSystemParamCache } from '@/hooks/core/system-param/read-system-param'
import { MenuThemeEnum, SystemThemeEnum } from '@/enums/app-enum'

export const APPEARANCE_CONFIG_KEY = 'ui.appearance.config'
type AppearanceConfig = typeof SETTING_DEFAULT_CONFIG

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export function getAppearanceConfig(store = useSettingStore()): AppearanceConfig {
  return Object.fromEntries(
    Object.keys(SETTING_DEFAULT_CONFIG).map((key) => [key, store[key as keyof AppearanceConfig]])
  ) as AppearanceConfig
}

function parseAppearanceConfig(raw: string): Partial<AppearanceConfig> | null {
  try {
    const source: unknown = JSON.parse(raw)
    if (!isRecord(source)) return null
    const result: Record<string, unknown> = {}
    for (const [key, fallback] of Object.entries(SETTING_DEFAULT_CONFIG)) {
      const value = source[key]
      if (typeof value === typeof fallback) result[key] = value
    }
    if (
      result.menuThemeType &&
      !Object.values(MenuThemeEnum).includes(result.menuThemeType as MenuThemeEnum)
    ) {
      delete result.menuThemeType
    }
    if (
      result.systemThemeMode &&
      !Object.values(SystemThemeEnum).includes(result.systemThemeMode as SystemThemeEnum)
    ) {
      delete result.systemThemeMode
    }
    if (
      typeof result.menuOpenWidth === 'number' &&
      (result.menuOpenWidth < 180 || result.menuOpenWidth > 320)
    ) {
      delete result.menuOpenWidth
    }
    return result as Partial<AppearanceConfig>
  } catch {
    return null
  }
}

export async function loadAppearanceConfig(): Promise<void> {
  const { data } = await fetchSystemParamByKey(APPEARANCE_CONFIG_KEY)
  const config = data && parseAppearanceConfig(data.paramValue)
  if (!config) return
  const store = useSettingStore()
  store.$patch(config)
  if (config.systemThemeColor) store.setElementTheme(config.systemThemeColor)
  if (config.customRadius) store.setCustomRadius(config.customRadius)
  if (config.systemThemeMode) useTheme().switchThemeStyles(config.systemThemeMode)
}

export async function saveAppearanceConfig(): Promise<void> {
  const { data } = await fetchSystemParamByKey(APPEARANCE_CONFIG_KEY)
  if (!data) throw new Error('未找到外观设置参数，请刷新后重试')
  await editSystemParam({ ...data, paramValue: JSON.stringify(getAppearanceConfig()) })
  clearSystemParamCache(APPEARANCE_CONFIG_KEY)
}
