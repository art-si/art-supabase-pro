import { createApp, defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import PageDesignReference from '@/components/business/page-design-reference/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', redirect: '/demo/workspace' },
    {
      path: '/demo/workspace',
      name: 'VisualAuditWorkspace',
      meta: { title: '测试工作台' },
      component: { template: '<div />' }
    }
  ]
})
const app = createApp(defineComponent({ render: () => h('main', [h(PageDesignReference)]) }))
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)

useUserStore(store).setUserInfo({
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  tenant: { tenantCode: 'platform', tenantName: '平台管理员租户', builtinType: 'platform' },
  platformSuper: true
})

await router.push('/demo/workspace')
await router.isReady()
app.mount('#page-design-reference-errors-preview')
