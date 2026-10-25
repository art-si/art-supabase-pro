import { ElMessage } from 'element-plus'
import { supabase } from '@/plugins/supabase'
import { useUserStore } from '@/store/modules/user'
import {
  markSupabaseSessionActive,
  notifySupabaseSessionExpired,
  registerSupabaseSessionExpiredHandler,
  SUPABASE_SESSION_EXPIRED_MESSAGE
} from '@/utils/supabase/session'

const TOKEN_SYNC_EVENTS = new Set(['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED'])

/**
 * 让 Supabase 的真实会话与持久化应用壳保持一致。
 * 刷新成功时同步令牌；确认失效时只提示并退出一次。
 */
export function setupSupabaseSessionLifecycle(): void {
  const userStore = useUserStore()

  registerSupabaseSessionExpiredHandler(async () => {
    if (!userStore.isLogin) return false

    ElMessage.closeAll()
    ElMessage.warning(SUPABASE_SESSION_EXPIRED_MESSAGE)
    try {
      await userStore.logOut()
    } catch {
      // 用户状态在 logOut 的 finally 中已安全清理，远端登出失败不应恢复失效业务壳。
    }
    return true
  })

  supabase.auth.onAuthStateChange((event, session) => {
    if (session && TOKEN_SYNC_EVENTS.has(event)) {
      markSupabaseSessionActive()
      userStore.setToken(session.access_token, session.refresh_token)
      return
    }

    if (event === 'INITIAL_SESSION' && !session && userStore.isLogin) {
      queueMicrotask(() => void notifySupabaseSessionExpired())
    }
  })
}
