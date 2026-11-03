import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const qaUserStore = useUserStore(store)
qaUserStore.setUserInfo({
  userId: 'tms-blacklist-visual',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
const qaMenuStore = useMenuStore(store)
const qaButtons = [
  'TmsDriverBlacklist:View',
  'TmsDriverBlacklist:Add',
  'TmsDriverBlacklist:Release',
  'TmsDriverBlacklist:Export'
]
qaMenuStore.setButtonList(
  qaButtons.map((name) => ({ name, path: '', type: 'button', meta: { title: name } }))
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/tms/basic-data/driver-blacklist',
      name: 'TmsDriverBlacklist',
      component: () => import('@tms/views/basic-data/driver-blacklist/index.vue')
    },
    {
      path: '/tms/qa-away',
      name: 'TmsQaAway',
      component: { render: () => h('p', '测试路由已切换') }
    }
  ]
})
const app = createApp({
  render: () =>
    h(
      'main',
      {
        class: 'art-page-view min-h-screen p-4',
        style: { background: 'var(--el-bg-color-page)' }
      },
      [h(RouterView)]
    )
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
window.addEventListener('tms-qa-leave-blacklist', () => void router.push('/tms/qa-away'))
window.addEventListener('tms-qa-switch-tenant', () =>
  qaUserStore.setUserInfo({
    userId: 'tms-blacklist-visual-other',
    tenantId: '22222222-2222-4222-8222-222222222222',
    platformSuper: false
  })
)
window.addEventListener('tms-qa-revoke-view', () =>
  qaMenuStore.setButtonList(
    qaButtons
      .filter((name) => name !== 'TmsDriverBlacklist:View')
      .map((name) => ({ name, path: '', type: 'button', meta: { title: name } }))
  )
)
const requestedRecordId = new URLSearchParams(location.search).get('recordId')
await router.push({
  path: '/tms/basic-data/driver-blacklist',
  query: requestedRecordId ? { recordId: requestedRecordId } : {}
})
await router.isReady()
app.mount('#tms-blacklist-visual')
