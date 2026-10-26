import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

useUserStore(store).setUserInfo({
  userId: 'tms-mainline-visual',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
const fixtureDict = (items: Array<[string, string]>): Api.DataCenter.DictListItem[] =>
  items.map(([value, label], sort) => ({
    name: label,
    code: value,
    label,
    value,
    status: '1',
    sort
  }))
useUserStore(store).setDictMap({
  tmsOrderStatus: fixtureDict([
    ['transporting', '运输中'],
    ['pending_pickup', '待提货']
  ]),
  tmsWaybillStatus: fixtureDict([
    ['transporting', '运输中'],
    ['accepted', '已接单'],
    ['pending', '待调度']
  ]),
  tmsDriverType: fixtureDict([
    ['primary', '主驾'],
    ['secondary', '副驾']
  ]),
  commonEnabledStatus: fixtureDict([
    ['enabled', '启用'],
    ['disabled', '停用']
  ]),
  vehicleRecordProcessed: fixtureDict([
    ['true', '已处理'],
    ['false', '未处理']
  ]),
  hrQualificationStatus: fixtureDict([['valid', '有效']]),
  hrQualificationVerificationStatus: fixtureDict([['verified', '已核验']]),
  tmsCostAuditStatus: fixtureDict([['approved', '已审核']]),
  tmsWaybillCostSettlementStatus: fixtureDict([['unsettled', '未结算']]),
  tmsWaybillCostType: fixtureDict([['parking', '停车费']]),
  tmsSettlementStatus: fixtureDict([['pending_review', '待审核']]),
  hrPayFrequency: fixtureDict([['monthly', '每月']])
})
const limited = new URLSearchParams(location.search).has('limited')
useMenuStore(store).setButtonList(
  (limited
    ? ['TmsOrderQuery:View']
    : [
        'TmsOrderQuery:View',
        'TmsOrderQuery:Export',
        'TmsDriverQuery:View',
        'TmsDriverQuery:Export',
        'VehicleQuery:View',
        'TmsLoadedWaybillList:View',
        'FinanceCustomerSettlement:View',
        'FinanceWaybillCost:View',
        'Hr:Employee:View',
        'Hr:Compliance:View',
        'Hr:Compensation:View',
        'Hr:Compensation:Amount:View',
        'TmsOrderList:Quote'
      ]
  ).map((name) => ({ name, path: '', type: 'button', meta: { title: name } }))
)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/tms/order-query',
      name: 'TmsOrderQuery',
      component: () => import('@tms/views/order-query/index.vue')
    },
    {
      path: '/tms/order-query/detail/:id',
      name: 'TmsOrderQueryDetail',
      component: () => import('@tms/views/order-query/detail/index.vue')
    },
    {
      path: '/tms/driver-query',
      name: 'TmsDriverQuery',
      component: () => import('@tms/views/driver-query/index.vue')
    },
    {
      path: '/tms/driver-query/detail/:id',
      name: 'TmsDriverQueryDetail',
      component: () => import('@tms/views/driver-query/detail/index.vue')
    },
    {
      path: '/vms/vehicle-query/detail/:id',
      component: { render: () => h('h1', '车辆综合查询目标页') }
    },
    {
      path: '/tms/waybill-management/detail/:id',
      component: { render: () => h('h1', '执行运单目标页') }
    },
    {
      path: '/fms/settlement/waybill-cost/detail/:id',
      component: { render: () => h('h1', '费用单目标页') }
    },
    {
      path: '/fms/settlement/customer-settlement',
      component: { render: () => h('h1', '客户对账目标页') }
    }
  ]
})

const app = createApp({
  render: () =>
    h(
      'main',
      {
        class: 'art-page-view min-h-screen p-4',
        style: { background: 'var(--el-bg-color-page)' }
      },
      [h(RouterView)]
    )
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)

const page = new URLSearchParams(location.search).get('page')
const initialRoute =
  page === 'order-detail'
    ? '/tms/order-query/detail/11111111-1111-4111-8111-111111111201'
    : page === 'driver-detail'
      ? '/tms/driver-query/detail/11111111-1111-4111-8111-111111111401'
      : page === 'driver-list'
        ? '/tms/driver-query'
        : '/tms/order-query'
await router.push(initialRoute)
await router.isReady()
app.mount('#tms-mainline-visual')
