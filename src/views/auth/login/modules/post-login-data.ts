export interface PostLoginDataDependencies {
  loadDictionaries: () => Promise<void>
  loadUserProfile: () => Promise<boolean>
  onDictionaryError?: (error: unknown) => void
}

export interface PostLoginDataInitialization {
  startDictionaries: () => Promise<void>
}

/**
 * 启动登录后的公共数据初始化。
 *
 * 用户资料决定是否允许进入系统，因此必须完成；字典是响应式辅助数据，
 * 由调用方在首屏路由完成后启动，避免与动态菜单争抢冷启动连接。
 */
export async function preparePostLoginData({
  loadDictionaries,
  loadUserProfile,
  onDictionaryError
}: PostLoginDataDependencies): Promise<PostLoginDataInitialization> {
  const hasUserProfile = await loadUserProfile()

  if (!hasUserProfile) {
    throw new Error('当前账号缺少有效的业务用户资料')
  }

  let dictionariesReady: Promise<void> | null = null
  const startDictionaries = (): Promise<void> => {
    dictionariesReady ??= loadDictionaries().catch((error: unknown) => {
      onDictionaryError?.(error)
    })
    return dictionariesReady
  }

  return { startDictionaries }
}
