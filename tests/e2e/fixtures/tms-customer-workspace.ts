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

const page = {
  name: 'TmsCustomer',
  path: '/tms/basic-data/customer',
  component: () => import('@tms/views/basic-data/customer/index.vue')
}
useUserStore(store).setUserInfo({
  userId: 'customer-fixture',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
const permissions = [
  'TmsCustomer:View',
  'TmsCustomer:Edit',
  'TmsCustomer:Add',
  'TmsCustomer:Delete',
  ...['Contact', 'Finance'].flatMap((kind) =>
    ['Add', 'Edit', 'Copy', 'Delete'].map((action) => `TmsCustomer:${kind}${action}`)
  ),
  'TmsContract:View',
  'TmsCustomerPrice:View',
  'TmsLoadedWaybillList:View',
  'TmsElectronicContract:View',
  'TmsTransportAgreement:View',
  'FinanceCustomerSettlement:View'
]
const readonly = new URLSearchParams(location.search).has('readonly')
document.body.dataset.fixtureReadonly = String(readonly)
useMenuStore(store).setButtonList(
  permissions
    .filter((name) => !readonly || name.endsWith(':View'))
    .map((name) => ({ name, path: '', type: 'button', meta: { title: name } }))
)
const router = createRouter({ history: createMemoryHistory(), routes: [page] })
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h(
        'main',
        { class: 'art-page-view h-screen p-4', style: { background: 'var(--el-bg-color-page)' } },
        [h(RouterView)]
      )
    )
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.push(page.path)
await router.isReady()
app.mount('#tms-customer-workspace')
