import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useMenuStore } from '@/store/modules/menu'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import FundAccountPage from '../../../modules/art-supabase-fms/src/views/treasury/fund-account/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp(FundAccountPage)
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'fund-account-test',
  tenantId: 'tenant-test',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  ['View', 'Add', 'Edit', 'Delete'].map((action) => ({
    name: `FinanceFundAccount:${action}`,
    path: '',
    type: 'button'
  }))
)
app.mount('#fund-account-scope-preview')
