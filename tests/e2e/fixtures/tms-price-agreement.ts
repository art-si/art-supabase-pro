import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const kind = new URLSearchParams(location.search).get('kind') === 'carrier' ? 'carrier' : 'customer'
const name = kind === 'carrier' ? 'TmsCarrierPrice' : 'TmsCustomerPrice'
useUserStore(store).setUserInfo({
  userId: 'agreement-review',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  [`${name}Edit:Save`, `${name}:Edit`, `${name}:View`].map((name) => ({
    name,
    type: 'button',
    path: '',
    meta: { title: name }
  }))
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/prices', name, component: { render: () => h('p', '协议价保存完成') } },
    {
      path: '/edit/:id',
      name: `${name}Edit`,
      component:
        kind === 'carrier'
          ? () => import('@tms/views/basic-data/carrier-price-edit/index.vue')
          : () => import('@tms/views/basic-data/customer-price-edit/index.vue')
    }
  ]
})
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h('main', { class: 'art-page-view p-4', style: { background: 'var(--el-bg-color-page)' } }, [
        h(RouterView)
      ])
    )
})
app.use(store).use(router).use(language)
setupGlobDirectives(app)
await router.push('/edit/11111111-1111-4111-8111-111111111201')
await router.isReady()
app.mount('#tms-price-agreement')
