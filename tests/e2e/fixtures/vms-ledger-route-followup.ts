import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

useUserStore(store).setUserInfo({
  userId: 'vms-ledger-route-followup',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  ['FuelCardLedger:View', 'ElectricCardLedger:View', 'OwnVehicleTask:View'].map((name) => ({
    name,
    path: '',
    type: 'button',
    meta: { title: name }
  }))
)

const routes = {
  fuel: '/vms/vehicle-manage/fuel-card-ledger',
  electric: '/vms/vehicle-manage/electric-card-ledger',
  task: '/vms/vehicle-manage/own-vehicle-task'
} as const
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: routes.fuel,
      component: () => import('@vms/views/vehicle-manage/fuel-card-ledger/index.vue')
    },
    {
      path: routes.electric,
      component: () => import('@vms/views/vehicle-manage/electric-card-ledger/index.vue')
    },
    {
      path: routes.task,
      component: () => import('@vms/views/vehicle-manage/own-vehicle-task/index.vue')
    }
  ]
})
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h(
        'main',
        {
          class: 'art-page-view min-h-screen p-4',
          style: { background: 'var(--el-bg-color-page)' }
        },
        [h(RouterView)]
      )
    )
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
const kind = new URLSearchParams(location.search).get('kind')
const initialPath =
  kind === 'electric' ? routes.electric : kind === 'task' ? routes.task : routes.fuel
await router.push(kind === 'task' ? initialPath : `${initialPath}?cardId=card-a`)
await router.isReady()
app.mount('#vms-ledger-route-followup')
// Test-only bridge: move the query without remounting the current page component.
Object.assign(window, {
  __vmsLedgerPushQuery: (cardId?: string) =>
    router.push({ path: initialPath, query: cardId ? { cardId } : {} })
})
