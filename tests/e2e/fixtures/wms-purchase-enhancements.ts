import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { useSettingStore } from '@/store/modules/setting'
import Workspace from '@/components/business/wms-purchase-document-workspace/index.vue'
import type { WmsPurchaseKind } from '@/api/wms-purchase'
import '@styles/core/tailwind.css'
import '@styles/index.scss'
const prefixes = {
  purchase_inbound: 'WmsPurchaseInbound',
  purchase_return: 'WmsPurchaseReturn',
  other_inbound: 'WmsOtherInbound',
  entrusted_processing_inbound: 'WmsEntrustedProcessingInbound',
  entrusted_processing_return: 'WmsEntrustedProcessingReturn'
}
const requested = new URLSearchParams(location.search).get('kind') || 'purchase_inbound'
const kind = (requested in prefixes ? requested : 'purchase_inbound') as keyof typeof prefixes
const prefix = prefixes[kind]
const permissions = Object.fromEntries(
  [
    'View',
    'Add',
    'Edit',
    'Delete',
    'Copy',
    'Import',
    'Export',
    'Push',
    'Submit',
    'Approve',
    'Withdraw',
    'Print'
  ].map((action) => [action, `${prefix}:${action}`])
) as Record<
  | 'View'
  | 'Add'
  | 'Edit'
  | 'Delete'
  | 'Copy'
  | 'Import'
  | 'Export'
  | 'Push'
  | 'Submit'
  | 'Approve'
  | 'Withdraw'
  | 'Print',
  string
>
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view p-4', style: { height: '100vh' } }, [
      h(
        ElConfigProvider,
        { locale: zhCn },
        { default: () => h(Workspace, { kind: kind as WmsPurchaseKind, permissions }) }
      )
    ])
})
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: {} }]
})
app.use(store).use(router).use(language)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'wms-preview-user',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: true
})
useTenantScopeStore(store).selectedTenantId = '11111111-1111-4111-8111-111111111111'
const setting = useSettingStore(store)
setting.setCustomRadius(setting.customRadius)
await router.push('/')
await router.isReady()
app.mount('#wms-preview')
