import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { setupGlobDirectives } from '@/directives'
import { mittBus } from '@/utils/sys'
import type { AppRouteRecord } from '@/types/router'
import Stock from '../../../modules/art-supabase-wms/src/views/initialization/initial-stock/index.vue'
import Sales from '../../../modules/art-supabase-wms/src/views/initialization/initial-sales/workspace.vue'
import Purchase from '../../../modules/art-supabase-wms/src/views/initialization/initial-purchase-inbound/index.vue'
import PurchaseReturn from '../../../modules/art-supabase-wms/src/views/initialization/initial-purchase-return/index.vue'
import Request from '../../../modules/art-supabase-wms/src/views/outbound-business/outbound-request/index.vue'
import Invoice from '../../../modules/art-supabase-wms/src/views/outbound-business/sales-invoice/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const kind = params.get('kind') || 'stock'
const contextRace = params.get('contextRace') === '1'
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const tenantScope = useTenantScopeStore(store)
const referenceEvents = ref(0)
mittBus.on('deleteReferenceBlocked', () => {
  referenceEvents.value += 1
})
const names: Record<string, string> = {
  stock: 'WmsInitialStock',
  sales: 'WmsInitialSalesOutbound',
  'sales-return': 'WmsInitialSalesReturn',
  outbound: 'WmsSalesOutbound',
  return: 'WmsSalesReturnDocument',
  other: 'WmsOtherOutbound',
  request: 'WmsIssueRequest',
  invoice: 'WmsSalesInvoice',
  purchase: 'WmsInitialPurchaseInbound',
  'purchase-return': 'WmsInitialPurchaseReturn'
}
const name = names[kind] || names.stock
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', name, component: {} }]
})
const linkedDocuments = (params.get('routeDocumentIds') || '').split(',').filter(Boolean)
document.documentElement.style.setProperty('--art-full-height', 'calc(100vh - 32px)')
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view', style: { padding: '16px' } }, [
      ...(contextRace
        ? [
            h(
              'button',
              { type: 'button', onClick: () => tenantScope.setTenantScope(tenantB) },
              '切换租户 B'
            ),
            h('output', { 'data-testid': 'bulk-context' }, tenantScope.effectiveTenantId ?? '')
          ]
        : []),
      h('output', { 'data-testid': 'bulk-reference-events' }, String(referenceEvents.value)),
      ...linkedDocuments.map((id, index) =>
        h(
          'button',
          {
            'data-testid': `open-linked-document-${index + 1}`,
            onClick: () => router.replace({ name, query: { documentId: id } })
          },
          `承接新草稿 ${index + 1}`
        )
      ),
      ['sales', 'sales-return', 'outbound', 'return', 'other'].includes(kind)
        ? h(Sales, {
            kind:
              kind === 'sales'
                ? 'initial_outbound'
                : kind === 'sales-return'
                  ? 'initial_return'
                  : kind === 'other'
                    ? 'other_outbound'
                    : kind === 'return'
                      ? 'return'
                      : 'outbound'
          })
        : kind === 'request'
          ? h(Request)
          : kind === 'invoice'
            ? h(Invoice)
            : h(
                kind === 'purchase' ? Purchase : kind === 'purchase-return' ? PurchaseReturn : Stock
              )
    ])
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'bulk-delete-test',
  tenantId: tenantA,
  platformSuper: contextRace || ['outbound', 'return', 'other', 'request', 'invoice'].includes(kind)
})
if (contextRace) {
  tenantScope.tenantOptions = [
    { id: tenantA, tenantCode: 'A', tenantName: '租户 A' },
    { id: tenantB, tenantCode: 'B', tenantName: '租户 B' }
  ]
  tenantScope.setTenantScope(tenantA)
}
useMenuStore(store).setButtonList(
  ['View', ...(params.get('authority') === 'readonly' ? [] : ['Delete'])].map<AppRouteRecord>(
    (action) => ({
      name: `${name}:${action}`,
      path: '',
      component: '',
      type: 'button',
      meta: { title: action }
    })
  )
)
app.mount('#wms-bulk-delete')
