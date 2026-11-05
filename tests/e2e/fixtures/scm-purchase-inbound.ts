import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import PurchaseWorkspace from '@scm/views/purchase-document/purchase-workspace.vue'
import PurchaseDialog from '@scm/views/purchase-document/modules/purchase-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const kind =
  new URLSearchParams(location.search).get('kind') === 'receipt_notice'
    ? 'receipt_notice'
    : 'purchase_order'
const importMode = new URLSearchParams(location.search).get('view') === 'import'
const importKind = new URLSearchParams(location.search).get('kind')
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const importPreview = defineComponent({
  setup() {
    const scope = useTenantScopeStore()
    return () =>
      h('main', { class: 'art-page-view p-4', style: { height: '100vh' } }, [
        h(
          'button',
          {
            type: 'button',
            'data-testid': 'scope-a',
            onClick: () => scope.setTenantScope(tenantA)
          },
          '切换租户 A'
        ),
        h(
          'button',
          {
            type: 'button',
            'data-testid': 'scope-b',
            onClick: () => scope.setTenantScope(tenantB)
          },
          '切换租户 B'
        ),
        h(PurchaseWorkspace, {
          kind:
            importKind === 'receipt_notice' || importKind === 'purchase_order'
              ? importKind
              : 'purchase_request'
        })
      ])
  }
})
const sourceRace = defineComponent({
  setup() {
    const dialog = ref<InstanceType<typeof PurchaseDialog>>()
    const open = (id: string) =>
      dialog.value?.handleOpen({
        kind: 'receipt_notice',
        initialSourceId: id,
        openLineSelector: true,
        effectiveTenantId: '11111111-1111-4111-8111-111111111111',
        tenantOptions: [{ label: '测试租户', value: '11111111-1111-4111-8111-111111111111' }]
      })
    return () =>
      h('main', { class: 'art-page-view p-4', style: { height: '100vh' } }, [
        h('button', { type: 'button', onClick: () => void open('order-a') }, '打开 A 来源'),
        h('button', { type: 'button', onClick: () => void open('order-b') }, '打开 B 来源'),
        h(PurchaseDialog, { ref: dialog })
      ])
  }
})
const app = createApp({
  render: () =>
    new URLSearchParams(location.search).get('race') === 'true'
      ? h(sourceRace)
      : importMode
        ? h(importPreview)
        : h('main', { class: 'art-page-view p-4', style: { height: '100vh' } }, [
            h(PurchaseWorkspace, { kind })
          ])
})
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: {} }]
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'purchase-preview-user',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: true
})
useTenantScopeStore(store).selectedTenantId = '11111111-1111-4111-8111-111111111111'
if (importMode)
  useTenantScopeStore(store).tenantOptions = [
    { id: tenantA, tenantCode: 'A', tenantName: '测试租户 A' },
    { id: tenantB, tenantCode: 'B', tenantName: '测试租户 B' }
  ]
await router.push('/')
await router.isReady()
app.mount('#purchase-inbound-preview')
