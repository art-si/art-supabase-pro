import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import EsopPage from '@mdm/views/engineering/esop/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({
  render: () => h('main', { class: 'art-page-view h-screen p-4' }, h(EsopPage))
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
  userId: 'esop-attachment-name-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  ['MdmEsop:View', 'MdmEsop:Import'].map((name) => ({
    name,
    path: '',
    type: 'button',
    meta: { title: '测试权限' }
  }))
)

app.mount('#esop-attachment-name')
