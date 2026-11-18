import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterLink, RouterView } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { initializeTheme } from '@/hooks/core/useTheme'
import { useSettingStore } from '@/store/modules/setting'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const query = new URLSearchParams(location.search)
const archiveReadOnly = query.has('archive-readonly')
const user = useUserStore(store)

user.setUserInfo({
  userId: 'vehicle-query-visual',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
user.setLoginStatus(true)
useMenuStore(store).setButtonList(
  [
    'VehicleQuery:View',
    'VehicleQuery:TabBasic',
    'VehicleQuery:Export',
    'VehicleArchive:View',
    'VehicleInspection:View',
    'VehicleArchive:TabBasic',
    'VehicleArchive:Edit',
    'VehicleArchive:Export',
    'FuelCardArchive:View',
    'FuelCardLedger:View',
    'ElectricCardArchive:View',
    'ElectricCardLedger:View',
    'TmsOrderQuery:View',
    'TmsDriverQuery:View',
    ...(archiveReadOnly ? ['VehicleArchive:TabTrailers', 'TrailerManage:View'] : [])
  ]
    .filter(
      (name) =>
        (name !== 'VehicleInspection:View' || query.get('inspection-view') !== 'denied') &&
        (name !== 'VehicleArchive:Edit' || !archiveReadOnly)
    )
    .map((name) => ({ name, path: '', type: 'button', meta: { title: name } }))
)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/vms/vehicle-manage/vehicle-inspection',
      name: 'VehicleInspection',
      component: () => import('@vms/views/vehicle-manage/vehicle-inspection/index.vue')
    },
    {
      path: '/vms/vehicle-manage/vehicle-inspection-detail/:id',
      name: 'VehicleInspectionDetail',
      component: () => import('@vms/views/vehicle-manage/vehicle-inspection-detail/index.vue')
    },
    {
      path: '/vms/vehicle-query',
      name: 'VehicleQuery',
      component: () => import('@vms/views/vehicle-query/index.vue')
    },
    {
      path: '/vms/vehicle-archive-manage',
      name: 'VehicleArchiveManage',
      component: () => import('@vms/views/vehicle-archive-manage/index.vue')
    },
    {
      path: '/vms/vehicle-archive-detail/:id',
      name: 'VehicleArchiveDetail',
      component: () => import('@vms/views/vehicle-archive-detail/index.vue')
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
    h(ElConfigProvider, { locale: zhCn }, () =>
      h(
        'main',
        {
          class: 'art-page-view min-h-screen p-4',
          style: {
            background: 'var(--el-bg-color-page)',
            '--art-full-height': 'calc(100dvh - 2rem)'
          }
        },
        [
          query.has('switch-vehicle')
            ? h(
                RouterLink,
                { to: '/vms/vehicle-query/detail/11111111-1111-4111-8111-111111111102' },
                () => '查看另一辆测试车辆'
              )
            : null,
          h(RouterView)
        ]
      )
    )
})
app.use(store)
app.use(router)
app.use(language)
initializeTheme()
document.documentElement.dataset.uiScope = 'workspace'
document.documentElement.dataset.boxMode = useSettingStore(store).boxBorderMode
  ? 'border-mode'
  : 'shadow-mode'
setupGlobDirectives(app)
await router.push(
  query.get('page') === 'inspection'
    ? '/vms/vehicle-manage/vehicle-inspection'
    : query.get('page') === 'archive'
      ? '/vms/vehicle-archive-manage'
      : query.get('page') === 'detail'
        ? '/vms/vehicle-query/detail/11111111-1111-4111-8111-111111111101'
        : '/vms/vehicle-query'
)
await router.isReady()
app.mount('#vehicle-query-visual')
