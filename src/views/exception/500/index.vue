<template>
  <ArtException
    :btn-events="retryInitialization"
    :secondary-btn-events="returnToLogin"
    :data="{
      title: '500',
      heading: $t('exceptionPage.500Title'),
      statusLabel: $t('exceptionPage.serviceUnavailable'),
      desc: $t('exceptionPage.500'),
      hint: $t('exceptionPage.500Hint'),
      btnText: $t('exceptionPage.retryInitialization'),
      secondaryBtnText: $t('exceptionPage.goLogin'),
      supportText: $t('exceptionPage.support'),
      visualLabel: $t('exceptionPage.systemStatus'),
      icon: 'ri:server-line',
      primaryIcon: 'ri:restart-line',
      secondaryIcon: 'ri:logout-box-r-line',
      tone: 'danger',
      imgUrl
    }"
  />
</template>

<script setup lang="ts">
  import imgUrl from '@imgs/svg/500.svg'
  import { recoverCurrentAuthSession } from '@/api/auth'
  import { resetRouteInitializationForRetry } from '@/router/guards/before-each'
  import { retryRouteWithFreshDocument } from '@/router/guards/error-recovery'
  import { resolveRouteInitializationTarget } from '@/router/guards/route-initialization'
  import { useUserStore } from '@/store/modules/user'

  defineOptions({ name: 'Exception500' })

  const route = useRoute()
  const userStore = useUserStore()

  const recoverSystem = async (): Promise<void> => {
    try {
      const session = await recoverCurrentAuthSession()
      if (session.status === 'expired') {
        await userStore.logOut('/')
        return
      }

      userStore.setToken(session.accessToken, session.refreshToken)
      userStore.setLoginStatus(true)
      resetRouteInitializationForRetry()

      retryRouteWithFreshDocument(resolveRouteInitializationTarget(route.query.redirect))
    } catch (error) {
      console.error('[Exception500] 系统恢复失败:', error)
      ElMessage.error('登录状态检查失败，请稍后重试')
    }
  }

  const retryInitialization = (): Promise<void> => recoverSystem()

  const returnToLogin = async (): Promise<void> => {
    try {
      resetRouteInitializationForRetry()
      await userStore.logOut('/')
    } catch (error) {
      console.error('[Exception500] 退出登录失败:', error)
      ElMessage.error('退出登录失败，请稍后重试')
    }
  }
</script>
