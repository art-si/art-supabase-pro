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
  userId: 'fuel-card-visual',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  [
    'FuelCardArchive:View',
    'FuelCardArchive:Add',
    'FuelCardArchive:Edit',
    'FuelCardArchive:Export',
    'FuelCardLedger:View',
    'FuelCardLedger:Recharge',
    'FuelCardLedger:Consume',
    'FuelCardLedger:Reverse',
    'FuelCardLedger:Import',
    'FuelCardLedger:Reconcile',
    'FuelCardLedger:Export',
    'VehicleQuery:View'
  ].map((name) => ({ name, path: '', type: 'button', meta: { title: name } }))
)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/vms/vehicle-manage/fuel-card-archive',
      component: () => import('@vms/views/vehicle-manage/fuel-card-archive/index.vue')
    },
    {
      path: '/vms/vehicle-manage/fuel-card-ledger',
      component: () => import('@vms/views/vehicle-manage/fuel-card-ledger/index.vue')
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
await router.push(
  new URLSearchParams(location.search).get('page') === 'ledger'
    ? '/vms/vehicle-manage/fuel-card-ledger'
    : '/vms/vehicle-manage/fuel-card-archive'
)
await router.isReady()
app.mount('#vms-fuel-card-visual')
