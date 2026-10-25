/**
 * 用户状态管理模块
 *
 * 提供用户相关的状态管理
 *
 * ## 主要功能
 *
 * - 用户登录状态管理
 * - 用户信息存储
 * - 访问令牌和刷新令牌管理
 * - 语言设置
 * - 搜索历史记录
 * - 锁屏状态和密码管理
 * - 登出清理逻辑
 *
 * ## 使用场景
 *
 * - 用户登录和认证
 * - 权限验证
 * - 个人信息展示
 * - 多语言切换
 * - 锁屏功能
 * - 搜索历史管理
 *
 * ## 持久化
 *
 * - 使用 localStorage 存储
 * - 存储键：sys-v{version}-user
 * - 登出时自动清理
 *
 * @module store/modules/user
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { LanguageEnum } from '@/enums/app-enum'
import { router } from '@/router'
import { useSettingStore } from './setting'
import { useWorktabStore } from './worktab'
import { AppRouteRecord } from '@/types/router'
import { setPageTitle } from '@/utils/router'
import { resetRouterState } from '@/router/guards/before-each'
import { useMenuStore } from './menu'
import { StorageConfig } from '@/utils/storage/storage-config'
import type { DictMap } from '@/types/store'

import { fetchCurrentUserInfo, logout } from '@/api/auth'
import { groupBy } from 'lodash-es'
import { hasPlatformSuperAccess } from '@/utils/platform-super-access'
import { isDictionaryCacheFresh } from './dictionary-cache-policy'
import { toDictionaryOption } from '@/utils/form/option'
/**
 * 用户状态管理
 * 管理用户登录状态、个人信息、语言设置、搜索历史、锁屏状态等
 */
export const useUserStore = defineStore(
  'userStore',
  () => {
    // 语言设置
    const language = ref(LanguageEnum.ZH)
    // 登录状态
    const isLogin = ref(false)
    // 锁屏状态
    const isLock = ref(false)
    // 锁屏密码
    const lockPassword = ref('')
    // 用户信息
    const info = ref<Partial<Api.Auth.UserInfo>>({})
    // 搜索历史记录
    const searchHistory = ref<AppRouteRecord[]>([])
    // 访问令牌
    const accessToken = ref('')
    // 刷新令牌
    const refreshToken = ref('')
    // 仅记录当前页面生命周期内最近一次成功刷新，避免登录完成后路由守卫立即重复请求。
    let userInfoFetchedAt = 0
    //数据字典数据
    const dictMap = ref<DictMap>({})
    let dictListFetchedAt = 0
    let dictListRequest: Promise<void> | null = null
    let dictCacheVersion = 0
    const dictCodeFetchedAt = new Map<string, number>()
    const dictCodeRequests = new Map<string, Promise<void>>()
    const displayDictItems = ref<Record<string, Api.DataCenter.DictListItem | null>>({})
    const displayDictRequests = new Map<string, Promise<void>>()

    const clearDictionaryCache = (): void => {
      dictCacheVersion += 1
      dictMap.value = {}
      dictListFetchedAt = 0
      dictListRequest = null
      dictCodeFetchedAt.clear()
      dictCodeRequests.clear()
      displayDictItems.value = {}
      displayDictRequests.clear()
    }
    // 计算属性：获取用户信息
    const getUserInfo = computed<Partial<Api.Auth.UserInfo>>(() => info.value)
    // 计算属性：获取用户信息
    const getDictMap = computed(() => dictMap.value)
    // 计算属性：获取设置状态
    const getSettingState = computed(() => useSettingStore().$state)
    // 计算属性：获取工作台状态
    const getWorktabState = computed(() => useWorktabStore().$state)
    const isPlatformSuper = computed(() => hasPlatformSuperAccess(getUserInfo.value))
    /**
     * 设置用户字典
     * @param data 字典信息
     */
    const setDictMap = (data: DictMap) => {
      dictMap.value = data
    }
    /**
     * 设置用户信息
     * @param newInfo 新的用户信息
     */
    const setUserInfo = (newInfo: Api.Auth.UserInfo) => {
      info.value = newInfo
    }

    /**
     * 设置登录状态
     * @param status 登录状态
     */
    const setLoginStatus = (status: boolean) => {
      isLogin.value = status
    }

    /**
     * 设置语言
     * @param lang 语言枚举值
     */
    const setLanguage = (lang: LanguageEnum) => {
      setPageTitle(router.currentRoute.value)
      language.value = lang
    }

    /**
     * 设置搜索历史
     * @param list 搜索历史列表
     */
    const setSearchHistory = (list: AppRouteRecord[]) => {
      searchHistory.value = list
    }

    /**
     * 设置锁屏状态
     * @param status 锁屏状态
     */
    const setLockStatus = (status: boolean) => {
      isLock.value = status
    }

    /**
     * 设置锁屏密码
     * @param password 锁屏密码
     */
    const setLockPassword = (password: string) => {
      lockPassword.value = password
    }

    /**
     * 设置令牌
     * @param newAccessToken 访问令牌
     * @param newRefreshToken 刷新令牌（可选）
     */
    const setToken = (newAccessToken: string, newRefreshToken?: string) => {
      accessToken.value = newAccessToken
      if (newRefreshToken) {
        refreshToken.value = newRefreshToken
      }
    }

    /**
     * 退出登录
     * 清空所有用户相关状态并跳转到登录页
     * 如果是同一账号重新登录，保留工作台标签页
     */
    const logOut = async (redirectTarget?: string) => {
      // 保存当前用户 ID，用于下次登录时判断是否为同一用户
      const currentUserId = info.value.userId
      if (currentUserId) {
        localStorage.setItem(StorageConfig.LAST_USER_ID_KEY, String(currentUserId))
      }
      try {
        await logout()
      } finally {
        // 即使远端会话已不可用，也必须清掉本地持久化登录壳。
        info.value = {}
        isLogin.value = false
        isLock.value = false
        lockPassword.value = ''
        accessToken.value = ''
        refreshToken.value = ''
        clearDictionaryCache()
        // 注意：不清空工作台标签页，等下次登录时根据用户判断
        sessionStorage.removeItem('iframeRoutes')
        useMenuStore().setHomePath('')
        resetRouterState(500)

        const currentRoute = router.currentRoute.value
        const redirect =
          redirectTarget ??
          (currentRoute.path !== '/auth/login' ? currentRoute.fullPath : undefined)
        await router.push({
          name: 'Login',
          query: redirect ? { redirect } : undefined
        })
      }
    }

    /**
     * 检查并清理工作台标签页
     * 如果不是同一用户登录，清空工作台标签页
     * 应在登录成功后调用
     */
    const checkAndClearWorkTabs = () => {
      const lastUserId = localStorage.getItem(StorageConfig.LAST_USER_ID_KEY)
      const currentUserId = info.value.userId

      // 无法获取当前用户 ID，跳过检查
      if (!currentUserId) return

      // 首次登录或缓存已清除，保留现有标签页
      if (!lastUserId) {
        return
      }

      // 不同用户登录，清空工作台标签页
      if (String(currentUserId) !== lastUserId) {
        const worktabStore = useWorktabStore()
        worktabStore.opened = []
        worktabStore.keepAliveExclude = []
      }

      // 清除临时存储
      localStorage.removeItem(StorageConfig.LAST_USER_ID_KEY)
    }

    /** Missing labels use the caller's fallback; configured empty labels stay empty. */
    const getDictLabelByValue = (
      dictCode: keyof DictMap | string,
      value?: string | number | null,
      fallback = ''
    ): string => {
      return getDictItemByValue(dictCode, value ?? undefined)?.label ?? fallback
    }

    const getDictItemByValue = (
      dictCode: keyof DictMap | string,
      value?: string | number | null
    ) => {
      if (value === undefined || value === null || value === '') return undefined

      return dictMap.value[dictCode]?.find((item) => String(item.value) === String(value))
    }

    const getDictDisplayItemByValue = (code: string, value?: string | number | null) => {
      if (value == null || value === '') return undefined
      return (
        getDictItemByValue(code, value) ??
        displayDictItems.value[JSON.stringify([code, String(value)])] ??
        undefined
      )
    }

    const ensureDictDisplayItemLoaded = async (
      code: string,
      value?: string | number | null
    ): Promise<void> => {
      if (!code || value == null || value === '') return
      await ensureDictLoaded(code)
      if (getDictItemByValue(code, value)) return
      const key = JSON.stringify([code, String(value)])
      if (Object.hasOwn(displayDictItems.value, key)) return
      const active = displayDictRequests.get(key)
      if (active) return active
      const version = dictCacheVersion
      const request = (async () => {
        const { fetchDictionaryDisplayItem } = await import('@/api/data-center')
        const { data, error } = await fetchDictionaryDisplayItem(code, String(value))
        if (error) throw error
        if (version !== dictCacheVersion) return
        displayDictItems.value[key] = data?.[0] ?? null
      })()
      displayDictRequests.set(key, request)
      try {
        await request
      } finally {
        if (displayDictRequests.get(key) === request) displayDictRequests.delete(key)
      }
    }

    /** Option labels use the dictionary name when the configured label is empty. */
    const getDictDisplayLabelByValue = (
      dictCode: keyof DictMap | string,
      value?: string | number | null,
      fallback = value === undefined || value === null ? '' : String(value)
    ): string => {
      const item = getDictItemByValue(dictCode, value)
      return item ? toDictionaryOption(item).label || fallback : fallback
    }

    const getDictTagTypeByValue = (
      dictCode: keyof DictMap | string,
      value?: string | number
    ): Api.Common.TagPreset | undefined => {
      const tagType = getDictItemByValue(dictCode, value)?.tagType
      return tagType ? (tagType as Api.Common.TagPreset) : undefined
    }

    const getDictTagByValue = (dictCode: keyof DictMap | string, value?: string | number) => {
      const dictItem = getDictItemByValue(dictCode, value)

      return {
        label: dictItem?.label ?? (value === undefined || value === null ? '' : String(value)),
        type: getDictTagTypeByValue(dictCode, value),
        color: dictItem?.color || undefined,
        item: dictItem
      }
    }

    const fetchUserInfo = async (signal?: AbortSignal): Promise<boolean> => {
      const { data, error, session } = await fetchCurrentUserInfo(signal)
      signal?.throwIfAborted()
      if (error) {
        throw new Error('用户资料加载失败', { cause: error })
      }
      if (!data) return false

      const { id: userId, userEmail: email, ...res } = data ?? {}
      setUserInfo({
        userId,
        email,
        ...res
      })
      setToken(session.accessToken, session.refreshToken)
      userInfoFetchedAt = Date.now()
      return true
    }

    const ensureUserInfo = async (signal?: AbortSignal): Promise<boolean> => {
      const recentlyFetched = Date.now() - userInfoFetchedAt < 30_000
      if (recentlyFetched && Boolean(info.value.userId)) return true

      return fetchUserInfo(signal)
    }

    const fetchDictList = async (): Promise<void> => {
      if (dictListRequest) return dictListRequest

      const loadVersion = dictCacheVersion
      const request = (async () => {
        const { fetchDictionaryList } = await import('@/api/data-center')
        const { data, error } = await fetchDictionaryList()
        if (error) throw error
        if (!data || loadVersion !== dictCacheVersion) return

        const { fetchMaterialUnitCompatibilityOptions } = await import('@/api/unit-of-measure')
        const units = await fetchMaterialUnitCompatibilityOptions()
        if (units.error) throw units.error
        if (loadVersion !== dictCacheVersion) return

        const groupData = groupBy(
          [
            ...data.filter(
              (item) => !['tmsCargoUnit', 'smisMaterialUnit'].includes(item.dictTypeTable.code)
            ),
            ...(units.data ?? [])
          ],
          (dictItem) => dictItem.dictTypeTable.code
        ) as DictMap
        Object.keys(groupData).forEach((key) => {
          groupData[key] = (groupData[key] ?? []).slice().sort((a, b) => {
            return Number(a.sort) - Number(b.sort)
          })
        })

        setDictMap(groupData)
        dictListFetchedAt = Date.now()
        Object.keys(groupData).forEach((code) => dictCodeFetchedAt.set(code, dictListFetchedAt))
      })()
      dictListRequest = request

      try {
        await request
      } finally {
        if (dictListRequest === request) dictListRequest = null
      }
    }

    const fetchDictByCode = async (dictCode: string): Promise<void> => {
      const activeRequest = dictCodeRequests.get(dictCode)
      if (activeRequest) return activeRequest

      const loadVersion = dictCacheVersion
      const request = (async () => {
        const { fetchDictionaryListByTypeCode } = await import('@/api/data-center')
        const { fetchMaterialUnitCompatibilityOptions } = await import('@/api/unit-of-measure')
        const { data, error } = ['tmsCargoUnit', 'smisMaterialUnit'].includes(dictCode)
          ? await fetchMaterialUnitCompatibilityOptions(dictCode)
          : await fetchDictionaryListByTypeCode(dictCode)
        if (error) throw error
        if (loadVersion !== dictCacheVersion) return

        dictMap.value = {
          ...dictMap.value,
          [dictCode]: (data ?? []).slice().sort((a, b) => Number(a.sort) - Number(b.sort))
        }
        dictCodeFetchedAt.set(dictCode, Date.now())
      })()
      dictCodeRequests.set(dictCode, request)

      try {
        await request
      } finally {
        if (dictCodeRequests.get(dictCode) === request) dictCodeRequests.delete(dictCode)
      }
    }

    const ensureDictLoaded = async (dictCode: keyof DictMap | string): Promise<void> => {
      const code = String(dictCode)
      // 全量缓存可能早于新增字典；缺失的类型需要单独补取。
      const listFetchedAt = Object.prototype.hasOwnProperty.call(dictMap.value, code)
        ? dictListFetchedAt
        : 0
      // 空字典也是已加载结果；不能按数组长度判断，否则每次渲染都会重新请求。
      if (isDictionaryCacheFresh(dictCodeFetchedAt.get(code), listFetchedAt)) return
      if (dictListRequest) {
        // 全量请求在途时复用其结果；若其失败，当前字典仍可按类型单独补取。
        await dictListRequest.catch(() => undefined)
        if (
          Object.prototype.hasOwnProperty.call(dictMap.value, code) &&
          isDictionaryCacheFresh(dictCodeFetchedAt.get(code), dictListFetchedAt)
        )
          return
      }
      await fetchDictByCode(code)
    }

    return {
      language,
      isLogin,
      isLock,
      lockPassword,
      info,
      searchHistory,
      accessToken,
      refreshToken,
      dictMap,
      isPlatformSuper,
      getDictMap,
      getUserInfo,
      getSettingState,
      getWorktabState,
      getDictLabelByValue,
      getDictDisplayLabelByValue,
      getDictItemByValue,
      getDictDisplayItemByValue,
      ensureDictDisplayItemLoaded,
      getDictTagTypeByValue,
      clearDictionaryCache,
      getDictTagByValue,
      setDictMap,
      setUserInfo,
      setLoginStatus,
      setLanguage,
      setSearchHistory,
      setLockStatus,
      setLockPassword,
      setToken,
      logOut,
      checkAndClearWorkTabs,
      fetchUserInfo,
      ensureUserInfo,
      fetchDictList,
      ensureDictLoaded
    }
  },
  {
    persist: {
      key: 'user',
      storage: localStorage
    }
  }
)
