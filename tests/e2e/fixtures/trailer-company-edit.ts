import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { initializeTheme } from '@/hooks/core/useTheme'
import TrailerDialog from '@vms/views/trailer-manage/modules/trailer-dialog.vue'
import VehicleTrailersPanel from '@vms/views/trailer-manage/modules/vehicle-trailers-panel.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const panelMode = params.get('panel')
const routePanel = panelMode === 'archive' || panelMode === 'view' || panelMode === 'query'
const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: 'trailer-form-user',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
userStore.setLoginStatus(true)
userStore.setDictMap({
  vehicleOwnership: [
    { value: 'self_operated', label: '自营车辆', code: 'self_operated', status: '1', sort: 0 },
    { value: 'carrier', label: '承运商', code: 'carrier', status: '1', sort: 1 }
  ],
  vehiclePlateColor: [{ value: 'yellow', label: '黄牌', code: 'yellow', status: '1', sort: 0 }],
  vehicleOperationStatus: [
    { value: 'operating', label: '营运', code: 'operating', status: '1', sort: 0 }
  ]
})
useMenuStore(store).setButtonList(
  [
    'TrailerManage:View',
    'VehicleArchive:View',
    'VehicleArchive:TabTrailers',
    ...(panelMode === 'view'
      ? []
      : ['VehicleArchive:Edit', 'TrailerManage:Add', 'TrailerManage:Edit', 'TrailerManage:Delete']),
    ...(panelMode === 'query' ? ['VehicleQuery:View', 'VehicleQuery:TabBasic'] : [])
  ].map((name) => ({
    name,
    path: '',
    type: 'button',
    meta: { title: name }
  }))
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/vms/vehicle-archive-detail/:id',
      component: () => import('@vms/views/vehicle-archive-detail/index.vue')
    },
    {
      path: '/vms/vehicle-query/detail/:id',
      component: () => import('@vms/views/vehicle-query/detail/index.vue')
    }
  ]
})
const app = createApp({
  setup() {
    const dialog = ref<InstanceType<typeof TrailerDialog>>()
    const showPanel = params.has('panel')
    return () =>
      h(
        'main',
        { class: 'art-page-view h-screen p-4' },
        routePanel
          ? [h(RouterView)]
          : showPanel
            ? [h(VehicleTrailersPanel, { vehicleId: 'tractor-1' })]
            : [
                h(
                  'button',
                  { type: 'button', onClick: () => dialog.value?.handleOpen() },
                  '打开挂车表单'
                ),
                h(TrailerDialog, { ref: dialog })
              ]
      )
  }
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
initializeTheme()
if (routePanel) {
  await router.push(
    panelMode === 'query'
      ? '/vms/vehicle-query/detail/tractor-1'
      : '/vms/vehicle-archive-detail/tractor-1'
  )
  await router.isReady()
}
app.mount('#trailer-company-edit')
