import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

useUserStore(store).setUserInfo({
  userId: 'vehicle-query-visual',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  ['VehicleQuery:View', 'VehicleQuery:Export', 'TmsOrderQuery:View', 'TmsDriverQuery:View'].map(
    (name) => ({ name, path: '', type: 'button', meta: { title: name } })
  )
)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/vms/vehicle-query',
      name: 'VehicleQuery',
      component: () => import('@vms/views/vehicle-query/index.vue')
    },
    {
      path: '/vms/vehicle-query/detail/:id',
      name: 'VehicleQueryDetail',
      component: () => import('@vms/views/vehicle-query/detail/index.vue')
    }
  ]
})

const app = createApp({
  render: () =>
    h(
      'main',
      { class: 'art-page-view min-h-screen p-4', style: { background: 'var(--el-bg-color-page)' } },
      [h(RouterView)]
    )
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.push(
  new URLSearchParams(location.search).get('page') === 'detail'
    ? '/vms/vehicle-query/detail/11111111-1111-4111-8111-111111111101'
    : '/vms/vehicle-query'
)
await router.isReady()
app.mount('#vehicle-query-visual')
