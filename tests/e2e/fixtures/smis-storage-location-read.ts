import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme } from '@/hooks/core/useTheme'
import language from '@/locales'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import ArtPageContent from '@/components/core/layouts/art-page-content/index.vue'
import SmisStorageLocationPage from '@smis/views/equipment-ledger/storage-location/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const scope = useTenantScopeStore(store)
const user = useUserStore(store)
const menu = useMenuStore(store)
const makeButton = (name: string) => ({
  name,
  path: '',
  type: 'button' as const,
  meta: { title: '存放位置操作' }
})
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view min-w-0 p-4' }, [
      h('button', { type: 'button', onClick: () => scope.setTenantScope(tenantB) }, '切换租户 B'),
      h('button', { type: 'button', onClick: () => scope.setTenantScope(tenantA) }, '切换租户 A'),
      h('button', { type: 'button', onClick: () => scope.setTenantScope(null) }, '切换全部租户'),
      h('button', { type: 'button', onClick: () => menu.setButtonList([]) }, '撤销删除权限'),
      h(ArtPageContent)
    ])
})

app.use(store)
initializeTheme()
document.documentElement.dataset.boxMode = useSettingStore(store).boxBorderMode
  ? 'border-mode'
  : 'shadow-mode'
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'SmisStorageLocation', component: SmisStorageLocationPage },
    {
      path: '/smis/equipment-ledger/equipment-ledger-detail/:id',
      name: 'SmisEquipmentLedgerDetail',
      component: () => import('@smis/views/equipment-ledger/equipment-ledger-detail/index.vue')
    },
    {
      path: '/mdm/material-master/material-archive',
      name: 'MdmMaterialArchive',
      component: () => import('@mdm/views/material-master/material-archive/index.vue')
    },
    {
      path: '/smis/safety-production/protective-equipment-management/ppe-issuance-record',
      name: 'SmisPpeIssuanceRecord',
      component: () =>
        import('@smis/views/safety-production/protective-equipment-management/ppe-issuance-record/index.vue')
    },
    {
      path: '/smis/safety-production/tool-requisition/tool-issuance-record',
      name: 'SmisToolIssuanceRecord',
      component: () =>
        import('@smis/views/safety-production/tool-requisition/tool-issuance-record/index.vue')
    }
  ]
})
app.use(router)
setupGlobDirectives(app)
user.setUserInfo({
  userId: 'smis-storage-location-read-test',
  tenantId: tenantA,
  platformSuper: !new URLSearchParams(location.search).has('ordinary')
})
menu.setButtonList(
  new URLSearchParams(location.search).has('ordinary')
    ? [makeButton('SmisStorageLocation:Delete')]
    : []
)
scope.tenantOptions = [
  { id: tenantA, tenantCode: 'A', tenantName: '租户 A' },
  { id: tenantB, tenantCode: 'B', tenantName: '租户 B' }
]
scope.setTenantScope(tenantA)
await router.push('/')
await router.isReady()
app.mount('#app')
