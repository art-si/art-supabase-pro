import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import ElectronicContractPage from '@tms/views/basic-data/electronic-contract/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const embedded = params.has('embedded')
const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: 'electronic-contract-fixture',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
} as Api.Auth.UserInfo)
userStore.setLoginStatus(true)

const dictionaries: Record<string, Array<[string, string]>> = {
  tmsElectronicContractStatus: [
    ['pending_signed', '待签署'],
    ['signed', '已签署'],
    ['terminated', '已终止']
  ],
  tmsElectronicContractApprovalStatus: [
    ['draft', '草稿'],
    ['pending', '审批中'],
    ['approved', '已通过'],
    ['rejected', '已驳回']
  ],
  tmsElectronicContractSettlementCycle: [
    ['natural_month', '按自然月'],
    ['monthly', '按月'],
    ['quarterly', '按季度']
  ],
  tmsElectronicContractTaxRate: [
    ['0', '0%'],
    ['0.03', '3%'],
    ['0.06', '6%'],
    ['0.09', '9%'],
    ['0.13', '13%']
  ]
}
userStore.setDictMap(
  Object.fromEntries(
    Object.entries(dictionaries).map(([code, values]) => [
      code,
      values.map(([value, label], sort) => ({ value, label, code: value, status: '1', sort }))
    ])
  )
)

const actions = params.has('noView')
  ? ['Preview']
  : params.has('limited')
    ? ['View']
    : ['View', 'Add', 'Edit', 'Preview', 'Submit', 'Sign', 'Copy', 'Delete', 'Terminate']
useMenuStore(store).setButtonList(
  actions.map((action) => ({
    name: `TmsElectronicContract:${action}`,
    path: '',
    type: 'button',
    meta: { title: action }
  }))
)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { name: 'TmsElectronicContract', path: '/', component: ElectronicContractPage },
    { name: 'TmsCustomer', path: '/tms/basic-data/customer', component: { template: '<div />' } },
    { name: 'TmsContract', path: '/tms/basic-data/contract', component: { template: '<div />' } }
  ]
})
router.afterEach((route) => {
  document.documentElement.dataset.electronicRouteQuery = JSON.stringify(route.query)
})
document.addEventListener('electronic-contract-fixture-leave', () => {
  void router
    .push({
      name: 'TmsContract',
      query: { recordId: '33333333-3333-4333-8333-333333333331' }
    })
    .then(() => {
      document.documentElement.dataset.electronicFixtureLeft = 'true'
    })
})
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view h-screen min-w-0 p-4' }, [
      h(
        ElectronicContractPage,
        embedded
          ? {
              embedded: true,
              customer: {
                id: '44444444-4444-4444-8444-444444444444',
                tenantId: '11111111-1111-4111-8111-111111111111',
                customerName: '验收客户'
              } as Api.Tms.BasicData.Customer
            }
          : {}
      )
    ])
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
document.documentElement.dataset.electronicFixtureReady = 'true'
await new Promise<void>((resolve) => {
  document.addEventListener('electronic-contract-fixture-start', () => resolve(), { once: true })
})
await router.push(
  embedded
    ? { name: 'TmsCustomer' }
    : params.has('deep')
      ? {
          name: 'TmsElectronicContract',
          query: { contractId: '33333333-3333-4333-8333-333333333331' }
        }
      : '/'
)
await router.isReady()
app.mount('#electronic-contract-upgrade')
