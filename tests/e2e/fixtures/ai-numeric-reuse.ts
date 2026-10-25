import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import Overview from '@/views/dashboard/ai-operations/index.vue'
import Drawer from '@/views/dashboard/ai-operations/modules/ai-run-detail-drawer.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({
  setup() {
    const drawer = ref<InstanceType<typeof Drawer>>()
    return () =>
      h('main', { class: 'p-4' }, [
        h(
          'button',
          { onClick: () => drawer.value?.handleOpen({ id: 'numeric-run' }) },
          '查看数值详情'
        ),
        h(Overview),
        h(Drawer, { ref: drawer })
      ])
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'ai-numeric-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
app.mount('#ai-numeric')
