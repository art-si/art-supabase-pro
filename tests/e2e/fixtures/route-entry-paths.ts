import { createApp, h, type Component } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import { ComponentLoader, registerApplicationViewModules } from '@/router/core/component-loader'
import { IframeRouteManager } from '@/router/core/iframe-route-manager'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const root = '../../../modules/art-supabase-tms/src/views'
registerApplicationViewModules(
  'tms',
  root,
  import.meta.glob<{ default: Component }>([
    '../../../modules/art-supabase-tms/src/views/waybill-management/pending/index.vue',
    '../../../modules/art-supabase-tms/src/views/waybill-management/loaded/index.vue',
    '../../../modules/art-supabase-tms/src/views/order-list/detail/index.vue'
  ])
)
const componentPath =
  new URLSearchParams(location.search).get('component') || '/examples/tables/basic'
if (componentPath === '/outside/iframe') {
  IframeRouteManager.getInstance().add({
    path: '/second',
    name: 'TestIframeSecond',
    meta: { title: '第二个外部页面', link: '/tests/e2e/fixtures/vehicle-company-options.html' }
  })
  IframeRouteManager.getInstance().add({
    path: '/',
    name: 'TestIframe',
    meta: {
      title: '外部业务页面',
      link: new URLSearchParams(location.search).has('empty-link')
        ? ''
        : '/tests/e2e/fixtures/mes-execution-query.html'
    }
  })
}
const component = new URLSearchParams(location.search).has('iframe-loader')
  ? new ComponentLoader().loadIframe()
  : new ComponentLoader().load(componentPath)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component },
    { path: '/second', component }
  ]
})
const app = createApp({
  render: () =>
    h('main', [h('button', { onClick: () => router.push('/second') }, '切换外链'), h(RouterView)])
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: true
} as Api.Auth.UserInfo)
app.mount('#route-entry-preview')
