import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useMenuStore } from '@/store/modules/menu'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { setupGlobDirectives } from '@/directives'
import AccountSetPage from '../../../modules/art-supabase-fms/src/views/accounting/account-set/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp(AccountSetPage)
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'account-set-scope-test',
  tenantId: 'tenant-platform',
  platformSuper: true
})
useMenuStore(store).setButtonList(
  ['View', 'Add', 'Edit', 'Active', 'Suspended', 'Archived'].map((action) => ({
    name: `FinanceAccountSet:${action}`,
    path: '',
    type: 'button'
  }))
)
const tenantScope = useTenantScopeStore(store)
await tenantScope.loadTenantOptions(true)
document
  .getElementById('scope-all')
  ?.addEventListener('click', () => tenantScope.setTenantScope(null))
document
  .getElementById('scope-a')
  ?.addEventListener('click', () =>
    tenantScope.setTenantScope('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  )
document
  .getElementById('scope-b')
  ?.addEventListener('click', () =>
    tenantScope.setTenantScope('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  )
app.mount('#account-set-scope-preview')
