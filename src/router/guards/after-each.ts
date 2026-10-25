import { nextTick } from 'vue'
import { useSettingStore } from '@/store/modules/setting'
import { Router } from 'vue-router'
import NProgress from 'nprogress'
import { useCommon } from '@/hooks/core/useCommon'
import { finishPendingLoading, getPendingLoading } from './before-each'
import { setWorktab } from '@/utils/navigation'
import { setPageTitle } from '@/utils/router'

/** 路由全局后置守卫 */
export function setupAfterEachGuard(router: Router) {
  const { scrollToTop } = useCommon()

  router.afterEach((to, from, failure) => {
    if (failure) {
      finishPendingLoading(to.fullPath)
      NProgress.done()
      return
    }

    setWorktab(to)
    setPageTitle(to)

    if (to.path !== from.path) {
      scrollToTop()
    }

    // 关闭进度条
    const settingStore = useSettingStore()
    if (settingStore.showNprogress) {
      NProgress.done()
      // 确保进度条完全移除，避免残影
      setTimeout(() => {
        NProgress.remove()
      }, 600)
    }

    // 关闭 loading 效果
    if (getPendingLoading()) {
      nextTick(() => {
        finishPendingLoading(to.fullPath)
      })
    }
  })
}
