import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import ContractPage from '@tms/views/basic-data/contract/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const customerId = '11111111-1111-4111-8111-111111111112'
const tenantId = '11111111-1111-4111-8111-111111111111'
useUserStore(store).setUserInfo({
  userId: 'contract-fixture',
  tenantId,
  platformSuper: false
} as Api.Auth.UserInfo)
const actions = new URLSearchParams(location.search).has('copyOnly')
  ? ['View', 'Copy']
  : ['View', 'Add', 'Edit', 'Delete', 'Export', 'Copy', 'Submit', 'Terminate']
useMenuStore(store).setButtonList(
  actions.map((action) => ({
    name: `TmsContract:${action}`,
    path: '',
    type: 'button',
    meta: { title: action }
  }))
)
const app = createApp({
  render: () => h(ContractPage, { customerId, customerTenantId: tenantId, embedded: true })
})
app.use(store)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/tms/basic-data/contract-detail/:id', component: { template: '<div />' } }
    ]
  })
)
app.use(language)
setupGlobDirectives(app)
app.mount('#contract-customer-tab')
