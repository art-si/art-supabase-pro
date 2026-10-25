import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import type { AppRouteRecord } from '@/types/router'
import { writePlatformTenantScopeActive, writeTenantScopeId } from '@/utils/tenant-scope-context'
import SitePage from '../../../modules/art-supabase-smis/src/views/basic-data/site/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const platformTenantId = '55555555-5555-4555-8555-555555555555'
const businessTenantId = '11111111-1111-4111-8111-111111111111'
const scope = new URLSearchParams(window.location.search).get('scope') ?? 'all'
const isPlatformSuper = scope === 'all' || scope === 'selected'
const selectedTenantId = scope === 'selected' ? businessTenantId : null

const layout = new URLSearchParams(window.location.search).has('layout')
const buttons = layout ? ['SmisSite:Import', 'SmisSite:Edit', 'SmisSite:Add'] : ['SmisSite:Import']
const app = createApp(SitePage)
app.use(store)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
app.use(language)
setupGlobDirectives(app)

const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId: isPlatformSuper ? platformTenantId : businessTenantId,
  tenant: {
    tenantCode: isPlatformSuper ? 'platform' : 'business',
    tenantName: isPlatformSuper ? '平台管理员租户' : '业务租户',
    builtinType: isPlatformSuper ? 'platform' : 'business'
  },
  platformSuper: isPlatformSuper,
  buttons
} as Api.Auth.UserInfo)
useMenuStore(store).setButtonList(
  buttons.map((name) => ({ name, type: 'button' }) as AppRouteRecord)
)

const tenantScopeStore = useTenantScopeStore(store)
tenantScopeStore.selectedTenantId = selectedTenantId
writePlatformTenantScopeActive(isPlatformSuper)
writeTenantScopeId(scope === 'ordinary-forged' ? platformTenantId : selectedTenantId)

app.mount('#smis-site-import-preview')
