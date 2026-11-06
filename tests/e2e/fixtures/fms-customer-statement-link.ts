import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const recordId = '11111111-1111-4111-8111-111111111901'
const customerId = '11111111-1111-4111-8111-111111111902'
const denied = new URLSearchParams(location.search).has('denied')

useUserStore(store).setUserInfo({
  userId: 'fms-customer-statement-link',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  denied
    ? []
    : [
        {
          name: 'FinanceCustomerSettlement:View',
          path: '',
          type: 'button',
          meta: { title: '查看客户对账' }
        }
      ]
)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      name: 'FinanceCustomerSettlement',
      path: '/fms/settlement/customer-settlement',
      component: () =>
        import('../../../modules/art-supabase-fms/src/views/settlement/customer-settlement/index.vue')
    }
  ]
})

const app = createApp({
  render: () => h('main', { class: 'art-page-view h-screen p-4' }, [h(RouterView)])
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.push({
  name: 'FinanceCustomerSettlement',
  query: { customerId, recordId }
})
await router.isReady()
app.mount('#fms-customer-statement-link')
