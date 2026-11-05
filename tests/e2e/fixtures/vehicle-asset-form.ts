import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { initializeTheme, useTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: 'asset-form-user',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
userStore.setLoginStatus(true)
const dictionaries: Record<string, Array<[string, string]>> = {
  vehicleOwnership: [
    ['self_operated', '自营车辆'],
    ['carrier', '承运商'],
    ['third_party', '第三方物流'],
    ['individual_affiliation', '个人挂靠']
  ],
  commonBoolean: [
    ['false', '否'],
    ['true', '是']
  ],
  vehiclePlateColor: [
    ['yellow', '黄牌'],
    ['blue', '蓝牌']
  ],
  vehicleUsageNature: [['freight', '货运']],
  vehicleOperationStatus: [['operating', '营运']],
  vehicleOriginType: [
    ['domestic', '国产'],
    ['imported', '进口']
  ]
}
userStore.setDictMap(
  Object.fromEntries(
    Object.entries(dictionaries).map(([code, values]) => [
      code,
      values.map(([value, label], sort) => ({ value, label, code: value, status: '1', sort }))
    ])
  )
)
useMenuStore(store).setButtonList(
  [
    'VehicleArchive:Add',
    'VehicleArchive:Edit',
    'VehicleArchive:TabBasic',
    'VehicleArchive:TabBody',
    'VehicleArchive:TabEngine',
    'VehicleArchive:TabOther',
    'VehicleArchive:TabTrailers'
  ].map((name) => ({ name, path: '', type: 'button', meta: { title: name } }))
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/vms/vehicle-archive-edit',
      component: () => import('@vms/views/vehicle-archive-edit/index.vue')
    },
    {
      path: '/vms/vehicle-archive-edit/:id',
      component: () => import('@vms/views/vehicle-archive-edit/index.vue')
    },
    { path: '/vms/vehicle-archive-manage', component: { render: () => h('div', '车辆档案列表') } }
  ]
})
const app = createApp({
  render: () => h('main', { class: 'art-page-view h-screen min-w-0 p-4' }, [h(RouterView)])
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
initializeTheme()
useTheme().switchThemeStyles(
  params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
)
document.documentElement.dataset.boxMode =
  params.get('theme') === 'dark' ? 'shadow-mode' : 'border-mode'
const editId = params.get('editId')
await router.push(
  editId ? `/vms/vehicle-archive-edit/${encodeURIComponent(editId)}` : '/vms/vehicle-archive-edit'
)
await router.isReady()
app.mount('#vehicle-asset-form')
