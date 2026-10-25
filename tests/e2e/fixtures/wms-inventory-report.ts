import { createApp, h, KeepAlive, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useSettingStore } from '@/store/modules/setting'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme } from '@/hooks/core/useTheme'
import type { AppRouteRecord } from '@/types/router'
import Workspace from '../../../modules/art-supabase-wms/src/views/inventory-trace/shared/inventory-report-workspace.vue'
import type { WmsInventoryReportKind } from '../../../modules/art-supabase-wms/src/api/inventory-report'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const kinds: WmsInventoryReportKind[] = ['stock', 'movement', 'ledger', 'receipt-issue']
const params = new URLSearchParams(location.search)
const requested = params.get('kind')
const kind = kinds.find((value) => value === requested) || 'stock'
const cached = params.get('cached') === 'true'
const active = ref(true)
document.documentElement.style.setProperty('--art-full-height', 'calc(100vh - 32px)')
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view', style: { padding: '16px' } }, [
      ...(cached
        ? [
            h(
              'button',
              {
                onClick: () => {
                  active.value = !active.value
                }
              },
              active.value ? '前往出库作业' : '返回库存报表'
            )
          ]
        : []),
      cached
        ? h(KeepAlive, null, { default: () => (active.value ? h(Workspace, { kind }) : null) })
        : h(Workspace, { kind })
    ])
})
app.use(store)
const settings = useSettingStore(store)
document.documentElement.dataset.boxMode = settings.boxBorderMode ? 'border-mode' : 'shadow-mode'
document.documentElement.classList.toggle('dark', settings.isDark)
initializeTheme()
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: {} },
      { path: '/wms/outbound-business/sales-outbound', component: {} }
    ]
  })
)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'inventory-report-test',
  tenantId: '7529f951-938e-4e2c-ac0d-316c136ae1f9',
  platformSuper: params.get('authority') !== 'ordinary'
})
useMenuStore(store).setButtonList(
  [
    'WmsStock:View',
    'WmsInventoryLedger:View',
    'WmsStockLedger:View',
    'WmsMaterialReceiptIssue:View'
  ].map<AppRouteRecord>((name) => ({
    name,
    path: '',
    component: '',
    type: 'button',
    meta: { title: name }
  }))
)
app.mount('#inventory-report')
