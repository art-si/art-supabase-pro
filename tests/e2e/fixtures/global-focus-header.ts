import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useSettingStore } from '@/store/modules/setting'
import ArtHeaderBar from '@/components/core/layouts/art-header-bar/index.vue'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const ordinary = new URLSearchParams(location.search).has('ordinary')
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'Home', component: { render: () => h('div') } },
    {
      path: '/system/user',
      name: 'SystemUser',
      meta: { title: '用户管理' },
      component: { render: () => h('div') }
    }
  ]
})

const app = createApp({
  render: () => h(ArtHeaderBar, { showWorkTab: false })
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)

const user = useUserStore(store)
user.setUserInfo({
  userId: ordinary ? 'focus-ordinary-user' : 'focus-platform-user',
  tenantId: '00000000-0000-4000-8000-000000000001',
  platformSuper: !ordinary
})
user.setLoginStatus(true)
const settings = useSettingStore(store)
settings.showCrumbs = false
settings.hideSettingGuide()
document.documentElement.dataset.uiScope = 'workspace'

await router.push('/system/user')
await router.isReady()
app.mount('#global-focus-header')
