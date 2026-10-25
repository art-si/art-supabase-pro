import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import DictionaryPage from '@/views/data-center/dict/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const app = createApp({
  render: () => h('main', { class: 'art-page-view h-screen p-4' }, [h(DictionaryPage)])
})
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: {} }]
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'location-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
await router.push({
  path: '/',
  query: {
    fromMasterDelete: '1',
    dependencyCode: params.get('mode') === 'item' ? 'dict_item_child' : 'dict_type_child',
    recordId: params.get('mode') === 'item' ? 'item-test' : 'type-test',
    dictTypeId: 'type-test'
  }
})
await router.isReady()
app.mount('#master-delete-location')
