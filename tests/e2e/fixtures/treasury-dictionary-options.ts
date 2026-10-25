import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import Transfer from '@fms/views/treasury/fund-transfer/index.vue'
import Journal from '@fms/views/treasury/fund-journal/index.vue'
import Reconciliation from '@fms/views/treasury/bank-reconciliation/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(location.search).get('mode')
const component =
  mode === 'journal' ? Journal : mode === 'reconciliation' ? Reconciliation : Transfer
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view h-screen p-4' }, [
      h(
        'button',
        { type: 'button', onClick: () => useUserStore(store).clearDictionaryCache() },
        '测试清空字典缓存'
      ),
      h(component)
    ])
})
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: {} }]
  })
)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'treasury-dictionary-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
app.mount('#treasury-dictionary-options')
