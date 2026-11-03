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
  userId: 'price-readonly-review',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useUserStore(store).setDictMap({
  tmsPriceAgreementStatus: [
    { value: 'draft', label: '草稿', status: '1' },
    { value: 'effective', label: '已生效', status: '1' }
  ],
  tmsCustomerPriceTransportType: [{ value: 'truckload', label: '整车', status: '1' }],
  tmsCarrierPriceTransportMode: [{ value: 'road', label: '公路运输', status: '1' }],
  tmsCustomerPriceBillingMethod: [{ value: 'by_weight', label: '按重量', status: '1' }],
  tmsCustomerPriceCargoType: [{ value: 'general', label: '普通货物', status: '1' }],
  tmsCargoUnit: [{ value: 'box', label: '箱', status: '1' }]
})
useMenuStore(store).setButtonList(
  [`${name}:View`, `${name}:Export`].map((permission) => ({
    name: permission,
    path: '',
    type: 'button',
    meta: { title: permission }
  }))
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/price',
      name,
      component:
        kind === 'carrier'
          ? () => import('@tms/views/basic-data/carrier-price/index.vue')
          : () => import('@tms/views/basic-data/customer-price/index.vue')
    },
    {
      path: '/price/:id',
      name: `${name}Detail`,
      component:
        kind === 'carrier'
          ? () => import('@tms/views/basic-data/carrier-price-detail/index.vue')
          : () => import('@tms/views/basic-data/customer-price-detail/index.vue')
    }
  ]
})
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h(
        'main',
        {
          class: 'art-page-view h-screen p-4',
          style: { '--art-full-height': 'calc(100vh - 32px)' }
        },
        [h(RouterView)]
      )
    )
})
app.use(store).use(router).use(language)
setupGlobDirectives(app)
await router.push('/price')
await router.isReady()
app.mount('#tms-price-readonly')
