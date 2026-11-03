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

const pages = {
  mileage: {
    name: 'VehicleMileage',
    path: '/vms/vehicle-manage/mileage-record',
    component: () => import('@vms/views/vehicle-manage/mileage-record/index.vue')
  },
  fuel: {
    name: 'FuelCardArchive',
    path: '/vms/vehicle-manage/fuel-card-archive',
    component: () => import('@vms/views/vehicle-manage/fuel-card-archive/index.vue')
  },
  electric: {
    name: 'ElectricCardArchive',
    path: '/vms/vehicle-manage/electric-card-archive',
    component: () => import('@vms/views/vehicle-manage/electric-card-archive/index.vue')
  },
  'fuel-ledger': {
    name: 'FuelCardLedger',
    path: '/vms/vehicle-manage/fuel-card-ledger',
    component: () => import('@vms/views/vehicle-manage/fuel-card-ledger/index.vue')
  },
  'electric-ledger': {
    name: 'ElectricCardLedger',
    path: '/vms/vehicle-manage/electric-card-ledger',
    component: () => import('@vms/views/vehicle-manage/electric-card-ledger/index.vue')
  }
}
useUserStore(store).setUserInfo({
  userId: 'vms-optimization',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  [
    ...Object.values(pages).flatMap(({ name }) =>
      ['View', 'Export'].map((action) => `${name}:${action}`)
    ),
    ...(new URLSearchParams(location.search).has('withActions')
      ? [
          'FuelCardArchive:Add',
          'FuelCardArchive:Edit',
          'FuelCardLedger:Recharge',
          'FuelCardLedger:Consume',
          'ElectricCardArchive:Add',
          'ElectricCardArchive:Edit',
          'ElectricCardLedger:Recharge',
          'ElectricCardLedger:Consume'
        ]
      : [])
  ].map((name) => ({
    name,
    path: '',
    type: 'button',
    meta: { title: name }
  }))
)
const router = createRouter({ history: createMemoryHistory(), routes: Object.values(pages) })
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h(
        'main',
        {
          class: 'art-page-view h-screen p-4',
          style: { background: 'var(--el-bg-color-page)' }
        },
        [
          h(RouterView),
          h(
            'output',
            { hidden: true, 'aria-label': '当前业务路由' },
            router.currentRoute.value.fullPath
          )
        ]
      )
    )
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
const kind = new URLSearchParams(location.search).get('kind') ?? 'mileage'
const initial = Object.entries(pages).find(([key]) => key === kind)?.[1] ?? pages.mileage
await router.push(initial.path)
await router.isReady()
app.mount('#vms-operations-optimization')
