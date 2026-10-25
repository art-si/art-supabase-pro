import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import RoutePage from '@mdm/views/process-master/process-route/index.vue'
import RouteDialog from '@mdm/views/process-master/process-route/modules/route-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const list = new URLSearchParams(location.search).get('mode') === 'list'
const app = createApp({
  setup() {
    const dialog = ref<InstanceType<typeof RouteDialog>>()
    return () =>
      list
        ? h(RoutePage)
        : h('main', { class: 'p-4' }, [
            h(
              'button',
              { type: 'button', onClick: () => dialog.value?.handleOpen(undefined, 'test-tenant') },
              '打开路线'
            ),
            h(RouteDialog, { ref: dialog })
          ])
  }
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'route-options-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
useMenuStore(store).setButtonList([
  { name: 'MdmProcessRoute:View', path: '', type: 'button', meta: { title: '测试权限' } }
])
await router.isReady()
app.mount('#app')
