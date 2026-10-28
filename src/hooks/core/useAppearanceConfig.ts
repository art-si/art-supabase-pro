import { SETTING_DEFAULT_CONFIG } from '@/config/setting'
import { fetchSystemParamByKey, editSystemParam } from '@/api/system-manage/system-param'
import { useSettingStore } from '@/store/modules/setting'
import { useTheme } from '@/hooks/core/useTheme'
import { clearSystemParamCache } from '@/hooks/core/system-param/read-system-param'
import { MenuThemeEnum, SystemThemeEnum } from '@/enums/app-enum'
import { useAuth } from '@/hooks/core/useAuth'

export const APPEARANCE_CONFIG_KEY = 'ui.appearance.config'
type AppearanceConfig = typeof SETTING_DEFAULT_CONFIG
type SettingStore = ReturnType<typeof useSettingStore>

interface AppearanceLoadState {
  initialized: boolean
  pending?: Promise<void>
}

interface ParsedAppearanceConfig {
  config: Partial<AppearanceConfig>
  hasLocalAppearance?: boolean
}

const appearanceLoads = new WeakMap<SettingStore, AppearanceLoadState>()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export function getAppearanceConfig(store = useSettingStore()): AppearanceConfig {
  return Object.fromEntries(
    Object.keys(SETTING_DEFAULT_CONFIG).map((key) => [key, store[key as keyof AppearanceConfig]])
  ) as AppearanceConfig
}

function parseAppearanceConfig(raw: string): ParsedAppearanceConfig | null {
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
    return {
      config: result as Partial<AppearanceConfig>,
      hasLocalAppearance:
        typeof source.hasLocalAppearance === 'boolean' ? source.hasLocalAppearance : undefined
    }
  } catch {
    return null
  }
}

function getAppearanceLoadState(store: SettingStore): AppearanceLoadState {
  const existing = appearanceLoads.get(store)
  if (existing) return existing

  const raw = store.getInitialAppearanceConfig()
  const cached = raw ? parseAppearanceConfig(raw) : null
  const legacyLocal = Boolean(
    cached && cached.hasLocalAppearance === undefined && Object.keys(cached.config).length
  )
  const state: AppearanceLoadState = { initialized: false }
  appearanceLoads.set(store, state)
  if (legacyLocal) store.rememberLocalAppearance()

  return state
}

/** 本地外观优先；未设置本地偏好时使用服务端默认值。 */
export async function loadAppearanceConfig(): Promise<void> {
  const store = useSettingStore()
  const state = getAppearanceLoadState(store)
  if (store.hasLocalAppearance || state.initialized) return
  if (state.pending) return state.pending

  state.pending = fetchSystemParamByKey(APPEARANCE_CONFIG_KEY)
    .then(({ data }) => {
      const config = data && parseAppearanceConfig(data.paramValue)?.config
      // 用户已操作设置时，即使请求晚返回也保留本地选择。
      if (store.hasLocalAppearance || !config || !Object.keys(config).length) return

      state.initialized = true
      store.$patch(config)
      if (config.systemThemeColor) store.setElementTheme(config.systemThemeColor)
      if (config.customRadius) store.setCustomRadius(config.customRadius)
      if (config.systemThemeMode) useTheme().switchThemeStyles(config.systemThemeMode)
    })
    .finally(() => {
      state.pending = undefined
    })
  return state.pending
}

export async function saveAppearanceConfig(): Promise<void> {
  if (!useAuth().hasAuth('System:SystemParam:Edit')) {
    throw new Error('当前账号没有保存默认外观的权限，界面调整已自动保存在本地')
  }
  const { data } = await fetchSystemParamByKey(APPEARANCE_CONFIG_KEY)
  if (!data) throw new Error('未找到外观设置参数，请刷新后重试')
  await editSystemParam({ ...data, paramValue: JSON.stringify(getAppearanceConfig()) })
  clearSystemParamCache(APPEARANCE_CONFIG_KEY)
}
