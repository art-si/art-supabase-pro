import { createApp, defineAsyncComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const pages = {
  benefits: () =>
    import('../../../modules/art-supabase-hr/src/views/operations/benefits/index.vue'),
  organization: () =>
    import('../../../modules/art-supabase-hr/src/views/personnel/organization-design/index.vue'),
  policy: () =>
    import('../../../modules/art-supabase-hr/src/views/operations/policy-acknowledgement/index.vue'),
  contingent: () =>
    import('../../../modules/art-supabase-hr/src/views/operations/contingent-workforce/index.vue'),
  review: () =>
    import('../../../modules/art-supabase-hr/src/views/operations/compensation-review/index.vue')
}
const page = new URLSearchParams(location.search).get('page') as keyof typeof pages
if (!Object.hasOwn(pages, page)) throw new Error('Unknown HR page fixture')
document.documentElement.style.setProperty('--art-full-height', 'calc(100vh - 32px)')
const component = defineAsyncComponent(pages[page])
const app = createApp({ render: () => h('main', { style: { padding: '16px' } }, h(component)) })
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'hr-layout-test',
  tenantId: 'hr-layout-tenant',
  platformSuper: true
})
app.mount('#hr-page-layout')
