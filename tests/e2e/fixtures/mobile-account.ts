import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { platformAuthContextKey } from '@/utils/auth-context'
import { setupGlobDirectives } from '@/directives'
import MobileAccountManager from '@/views/system/user/modules/mobile-account-manager.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const manager = ref<InstanceType<typeof MobileAccountManager>>()
const app = createApp({
  render: () =>
    h('main', { class: 'p-4' }, [
      h('button', { onClick: () => manager.value?.handleOpen() }, '打开移动账号'),
      h(MobileAccountManager, { ref: manager })
    ])
})
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
app.provide(platformAuthContextKey, { hasAuth: () => true })
useUserStore(store).$patch({ info: { userId: 'qa-admin', tenantId: 'qa-tenant' } })
setupGlobDirectives(app)
app.mount('#mobile-account-preview')
