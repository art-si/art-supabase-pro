import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useMenuStore } from '@/store/modules/menu'
import { useUserStore } from '@/store/modules/user'
import CargoPage from '@tms/views/basic-data/cargo/index.vue'
import StationPage from '@tms/views/station/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(window.location.search).get('mode')
const app = createApp(mode === 'cargo' ? CargoPage : StationPage)
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'import-test-user',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setButtonList([
  { name: 'TmsCargo:Import', type: 'button', path: '', meta: { title: '导入货物' } },
  { name: 'TmsStation:Import', type: 'button', path: '', meta: { title: '导入站点' } }
])
useUserStore(store).setDictMap({
  tmsStationType: [
    { name: '发货站', code: 'shipping', value: 'shipping', label: '发货站', status: '1' }
  ]
})
app.mount('#tms-import-preview')
