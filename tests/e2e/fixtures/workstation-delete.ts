import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import WorkstationPage from '../../../modules/art-supabase-mdm/src/views/process-master/workstation/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', name: 'MdmWorkstation', component: {} }]
})
const app = createApp({ render: () => h(WorkstationPage) })
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'permission-test-user',
  tenantId: 'permission-test-tenant',
  platformSuper: !new URLSearchParams(location.search).has('ordinary')
})
if (new URLSearchParams(location.search).has('ordinary')) {
  useMenuStore(store).setButtonList(
    ['View', 'Delete'].map((action) => ({
      name: `MdmWorkstation:${action}`,
      path: `MdmWorkstation:${action}`,
      type: 'button',
      meta: { title: action }
    }))
  )
}
await router.isReady()
document.addEventListener('revoke-workstation-delete', () => {
  useUserStore(store).setUserInfo({
    userId: 'permission-test-user',
    tenantId: 'permission-test-tenant',
    platformSuper: false
  })
  useMenuStore(store).setButtonList([
    {
      name: 'MdmWorkstation:View',
      path: 'MdmWorkstation:View',
      type: 'button',
      meta: { title: '查看工位' }
    }
  ])
})
app.mount('#workstation-delete')
