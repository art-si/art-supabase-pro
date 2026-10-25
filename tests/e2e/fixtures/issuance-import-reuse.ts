import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { writePlatformTenantScopeActive, writeTenantScopeId } from '@/utils/tenant-scope-context'
import PpePage from '@smis/views/safety-production/protective-equipment-management/ppe-issuance-record/index.vue'
import ToolPage from '@smis/views/safety-production/tool-requisition/tool-issuance-record/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(window.location.search)
const scope = params.get('scope') ?? 'ordinary'
const platformTenantId = '55555555-5555-4555-8555-555555555555'
const businessTenantId = '11111111-1111-4111-8111-111111111111'
const platform = scope === 'all' || scope === 'selected'
const selectedTenantId = scope === 'selected' ? businessTenantId : null
const app = createApp(params.get('mode') === 'tool' ? ToolPage : PpePage)
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'issuance-import-test',
  tenantId: platform ? platformTenantId : businessTenantId,
  platformSuper: platform
})
useMenuStore(store).setButtonList(
  ['SmisPpeIssuanceRecord', 'SmisToolIssuanceRecord'].flatMap((name) =>
    ['View', 'Import'].map((action) => ({
      name: `${name}:${action}`,
      type: 'button',
      path: '',
      meta: { title: action }
    }))
  )
)
useTenantScopeStore(store).selectedTenantId = selectedTenantId
writePlatformTenantScopeActive(platform)
writeTenantScopeId(scope === 'ordinary-forged' ? platformTenantId : selectedTenantId)
app.mount('#issuance-import-preview')
