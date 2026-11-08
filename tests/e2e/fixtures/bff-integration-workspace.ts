import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme } from '@/hooks/core/useTheme'
import { useUserStore } from '@/store/modules/user'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const Page = (await import('@/views/data-center/bff-integration/index.vue')).default
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', redirect: '/bff-integration' },
    { path: '/bff-integration', component: {} }
  ]
})
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h('main', { class: 'art-page-view p-4' }, [h(Page)])
    )
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'bff-layout-user',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
await router.push('/bff-integration')
await router.isReady()
initializeTheme()
document.documentElement.dataset.uiScope = 'workspace'
document.documentElement.style.setProperty('--art-full-height', 'calc(100vh - 32px)')
app.mount('#app')
