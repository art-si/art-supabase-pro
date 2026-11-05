import { computed, effectScope, ref, watch } from 'vue'
import { fetchSystemParamByKey, editSystemParam } from '@/api/system-manage/system-param'
import { useUserStore } from '@/store/modules/user'
import { StorageConfig } from '@/utils/storage/storage-config'
import { APPEARANCE_CONFIG_KEY, parseAppearanceRecord } from '@/hooks/core/useAppearanceConfig'
import { clearSystemParamCache } from '@/hooks/core/system-param/read-system-param'

const enabled = ref(false)
const initialized = ref(false)
const loading = ref(false)
const hasLocalPreference = ref(false)
let activeUserId = ''
let loadVersion = 0
let pendingLoad: Promise<void> | undefined
let watchingUser = false

const storageKey = (userId: string): string =>
  StorageConfig.generateStorageKey(`global-focus-${userId}`)

const readLocalPreference = (userId: string): boolean | undefined => {
  try {
    const value = localStorage.getItem(storageKey(userId))
    if (value === 'true') return true
    if (value === 'false') return false
  } catch {
    // A blocked storage area still permits a session-only preference.
  }
  return undefined
}

const resetForUser = (userId: string): void => {
  activeUserId = userId
  loadVersion++
  pendingLoad = undefined
  loading.value = false
  initialized.value = false
  const localValue = userId ? readLocalPreference(userId) : undefined
  hasLocalPreference.value = localValue !== undefined
  enabled.value = localValue ?? false
  if (localValue !== undefined) initialized.value = true
}

/** Local account preference wins over the platform default. */
export const loadGlobalFocusPreference = async (): Promise<void> => {
  const userStore = useUserStore()
  const userId = userStore.isLogin ? String(userStore.getUserInfo.userId || '') : ''
  if (userId !== activeUserId) resetForUser(userId)
  if (!userId || initialized.value) return
  if (pendingLoad) return pendingLoad

  const version = loadVersion
  loading.value = true
  const request = fetchSystemParamByKey(APPEARANCE_CONFIG_KEY)
    .then(({ data, error }) => {
      if (version !== loadVersion || activeUserId !== userId || hasLocalPreference.value) return
      const appearance = data && !error ? parseAppearanceRecord(data.paramValue) : null
      enabled.value = appearance?.globalFocusMode === true
      initialized.value = true
    })
    .catch(() => {
      if (version !== loadVersion || activeUserId !== userId || hasLocalPreference.value) return
      enabled.value = false
      initialized.value = true
    })
    .finally(() => {
      if (version !== loadVersion) return
      loading.value = false
      pendingLoad = undefined
    })
  pendingLoad = request
  return request
}

/** Switch only this account in the current browser. */
export const setLocalGlobalFocusPreference = (value: boolean): void => {
  const userStore = useUserStore()
  const userId = userStore.isLogin ? String(userStore.getUserInfo.userId || '') : ''
  if (!userId) throw new Error('请先登录后再切换专注模式')
  if (userId !== activeUserId) resetForUser(userId)
  try {
    localStorage.setItem(storageKey(userId), String(value))
  } catch {
    // Keep the selection effective for this session if storage is unavailable.
  }
  loadVersion++
  pendingLoad = undefined
  loading.value = false
  hasLocalPreference.value = true
  enabled.value = value
  initialized.value = true
}

/** Save the platform-wide default; only the authenticated platform super may call this. */
export const saveGlobalFocusPreference = async (value: boolean): Promise<void> => {
  const userStore = useUserStore()
  if (!userStore.isLogin || !userStore.isPlatformSuper) {
    throw new Error('只有平台超级管理员可以保存平台专注模式设置')
  }
  const userId = String(userStore.getUserInfo.userId || '')
  if (!userId) throw new Error('请先登录后再保存专注模式设置')
  const { data, error } = await fetchSystemParamByKey(APPEARANCE_CONFIG_KEY)
  if (error) throw error
  if (!data?.id) throw new Error('未找到外观设置平台参数，请刷新后重试')
  const appearance = parseAppearanceRecord(data.paramValue)
  if (!appearance) throw new Error('平台外观设置格式无效，请先修复参数配置')
  await editSystemParam(
    { ...data, paramValue: JSON.stringify({ ...appearance, globalFocusMode: value }) },
    { showMessage: false, showErrorMessage: false }
  )
  clearSystemParamCache(APPEARANCE_CONFIG_KEY)
  if (userId !== activeUserId) resetForUser(userId)
  try {
    localStorage.removeItem(storageKey(userId))
  } catch {
    // The saved platform value still applies in this session.
  }
  loadVersion++
  pendingLoad = undefined
  loading.value = false
  hasLocalPreference.value = false
  enabled.value = value
  initialized.value = true
}

/** Shared reactive state for the header and pages that support focus mode. */
export const useGlobalFocusPreference = () => {
  const userStore = useUserStore()
  if (!watchingUser) {
    watchingUser = true
    effectScope(true).run(() => {
      watch(
        () => [userStore.isLogin, userStore.getUserInfo.userId] as const,
        () => {
          const userId = userStore.isLogin ? String(userStore.getUserInfo.userId || '') : ''
          if (userId !== activeUserId) resetForUser(userId)
          if (userId) void loadGlobalFocusPreference()
        },
        { immediate: true }
      )
    })
  }
  return {
    enabled: computed(() => enabled.value),
    initialized: computed(() => initialized.value),
    loading: computed(() => loading.value),
    hasLocalPreference: computed(() => hasLocalPreference.value),
    load: loadGlobalFocusPreference,
    setLocalPreference: setLocalGlobalFocusPreference,
    saveGlobalPreference: saveGlobalFocusPreference
  }
}
