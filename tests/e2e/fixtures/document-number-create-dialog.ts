import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import DocumentNumberCreateDialog from '@/views/system/document-number/modules/document-number-create-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const platformTenantId = '55555555-5555-4555-8555-555555555555'
const businessTenantId = '11111111-1111-4111-8111-111111111111'
const selectedTenantId =
  new URLSearchParams(window.location.search).get('scope') === 'selected' ? businessTenantId : null

const app = createApp(DocumentNumberCreateDialog)
const previewRouter = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }]
})
app.use(store)
app.use(previewRouter)
app.use(language)
setupGlobDirectives(app)

const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId: platformTenantId,
  tenant: { tenantCode: 'platform', tenantName: '平台管理员租户', builtinType: 'platform' },
  platformSuper: true
} as Api.Auth.UserInfo)

const tenantScopeStore = useTenantScopeStore(store)
tenantScopeStore.selectedTenantId = selectedTenantId
tenantScopeStore.tenantOptions = [
  {
    id: platformTenantId,
    tenantCode: 'platform',
    tenantName: '平台管理员租户',
    builtinType: 'platform',
    status: '1'
  },
  {
    id: businessTenantId,
    tenantCode: 'business',
    tenantName: '视觉验收业务租户',
    builtinType: 'business',
    status: '1'
  }
]

const preview = app.mount('#number-rule-preview') as unknown as { handleOpen?: () => Promise<void> }
void preview.handleOpen?.()
