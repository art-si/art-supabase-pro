import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { setupGlobDirectives } from '@/directives'
import CustomerDialog from '@tms/views/basic-data/customer/modules/customer-dialog.vue'
import CarrierDialog from '@tms/views/basic-data/carrier/modules/carrier-dialog.vue'
import { fetchCarrierParentOptions } from '@tms/api'
import CustomerAddressDialog from '@tms/views/basic-data/customer-address/modules/customer-address-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

type CoordinateCase = 'range' | 'half' | 'negative'

const tenantId = '11111111-1111-4111-8111-111111111111'
const selectedTenantId = '22222222-2222-4222-8222-222222222222'
const customerRef = ref<InstanceType<typeof CustomerDialog>>()
const carrierRef = ref<InstanceType<typeof CarrierDialog>>()
const addressRef = ref<InstanceType<typeof CustomerAddressDialog>>()
const explicitParentIds = ref<string[]>([])
const defaultParentIds = ref<string[]>([])
const coordinates: Record<
  CoordinateCase,
  { longitude: number; latitude: number | null; status: string }
> = {
  range: { longitude: 181, latitude: 91, status: 'located' },
  half: { longitude: 121, latitude: null, status: 'located' },
  negative: { longitude: -73.9857, latitude: -40.7484, status: 'pending' }
}

const openCustomer = (key: CoordinateCase): void => {
  const location = coordinates[key]
  void customerRef.value?.handleOpen({
    groups: [],
    row: {
      id: 'customer-1',
      tenantId,
      customerCode: 'C-001',
      customerName: '测试客户',
      region: '上海市/上海市/黄浦区',
      addressDetail: '测试地址 1 号',
      longitude: location.longitude,
      latitude: location.latitude,
      coordinateStatus: location.status,
      fieldAccess: {
        addressDetail: 'edit',
        contactPhone: 'edit',
        taxNo: 'edit',
        bankAccount: 'edit'
      }
    } as Api.Tms.BasicData.Customer
  })
}

const openAddress = (key: CoordinateCase): void => {
  const location = coordinates[key]
  void addressRef.value?.handleOpen(
    {
      id: 'address-1',
      tenantId,
      customerId: 'customer-1',
      addressType: 'shipping',
      partyName: '测试客户',
      addressShortName: '上海仓',
      contactName: '测试联系人',
      contactPhone: '13800138000',
      region: '上海市/上海市/黄浦区',
      addressDetail: '测试地址 1 号',
      longitude: location.longitude,
      latitude: location.latitude,
      coordinateStatus: location.status,
      fieldAccess: { addressDetail: 'edit', contactPhone: 'edit' }
    } as Api.Tms.BasicData.CustomerAddress,
    { customerId: 'customer-1', customerName: '测试客户' }
  )
}

const openCarrier = (isNew = false, otherTenant = false): void => {
  void carrierRef.value?.handleOpen(
    isNew
      ? undefined
      : {
          id: otherTenant ? 'carrier-b' : 'carrier-1',
          carrierCode: otherTenant ? 'CARRIER-B' : 'CARRIER-001',
          companyName: otherTenant ? '其他租户承运商' : '当前承运商',
          // The carrier-children fixture uses an explicit current taxonomy value.
          // Other legacy fixtures keep enterprise unchanged for separate review.
          carrierType: new URLSearchParams(location.search).has('carrierChildren')
            ? 'truckload'
            : 'enterprise',
          carrierTypes: [
            new URLSearchParams(location.search).has('carrierChildren') ? 'truckload' : 'enterprise'
          ],
          dispatchChannels: ['offline'],
          enabled: true
        }
  )
}

const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view', style: { padding: '16px' } }, [
      ...(['range', 'half', 'negative'] as const).flatMap((key) => [
        h('button', { type: 'button', onClick: () => openCustomer(key) }, `打开客户 ${key}`),
        h('button', { type: 'button', onClick: () => openAddress(key) }, `打开地址 ${key}`)
      ]),
      h('button', { type: 'button', onClick: () => openCarrier() }, '打开承运商'),
      h(
        'button',
        { type: 'button', onClick: () => openCarrier(false, true) },
        '打开其他租户承运商'
      ),
      h('button', { type: 'button', onClick: () => openCarrier(true) }, '新增承运商'),
      h(
        'button',
        {
          type: 'button',
          onClick: async () => {
            explicitParentIds.value = (
              await fetchCarrierParentOptions({ tenantId: selectedTenantId })
            )
              .map((item) => item.id)
              .filter((id): id is string => Boolean(id))
          }
        },
        '加载显式租户上级单位'
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: async () => {
            defaultParentIds.value = (await fetchCarrierParentOptions({}))
              .map((item) => item.id)
              .filter((id): id is string => Boolean(id))
          }
        },
        '加载默认租户上级单位'
      ),
      h(
        'output',
        { 'data-testid': 'explicit-carrier-parent-ids' },
        explicitParentIds.value.join(',')
      ),
      h(
        'output',
        { 'data-testid': 'default-carrier-parent-ids' },
        defaultParentIds.value.join(',')
      ),
      h(CarrierDialog, { ref: carrierRef }),
      h(CustomerDialog, { ref: customerRef }),
      h(CustomerAddressDialog, { ref: addressRef })
    ])
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
const scopeMode = new URLSearchParams(location.search).get('scope')
const platformSuper = scopeMode === 'all' || scopeMode === 'selected'
const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: 'tms-coordinate-test',
  tenantId,
  platformSuper
})
if (new URLSearchParams(location.search).has('carrierChildren')) {
  const dict = (items: Array<[string, string]>) =>
    items.map(([value, label]) => ({ name: label, code: value, value, label, status: '1' }))
  userStore.setDictMap({
    tmsCarrierType: dict([['truckload', '整车运输']]),
    tmsCarrierDispatchChannel: dict([['offline', '线下']]),
    tmsWaybillStatus: dict([['pending', '待接单']]),
    vehicleOperationStatus: dict([['operating', '营运']]),
    tmsSettlementStatus: dict([['draft', '草稿']])
  })
  useMenuStore(store).setButtonList(
    [
      'TmsCarrier:Add',
      'TmsCarrier:Edit',
      'TmsCarrier:View',
      'TmsDriver:View',
      'VehicleArchive:View',
      'TmsLoadedWaybillList:View',
      'TmsCarrierPrice:View',
      'FinanceCarrierSettlement:View'
    ].map((permission) => ({
      name: permission,
      path: '',
      type: 'button',
      meta: { title: permission }
    }))
  )
}
if (new URLSearchParams(location.search).has('parentTree')) {
  useMenuStore(store).setButtonList(
    ['TmsCustomer:Edit', 'TmsCarrier:Edit', 'TmsCarrier:Add'].map((permission) => ({
      name: permission,
      path: '',
      type: 'button',
      meta: { title: permission }
    }))
  )
}
if (platformSuper) {
  const scope = useTenantScopeStore(store)
  scope.scopeOwnerUserId = 'tms-coordinate-test'
  scope.setTenantScope(scopeMode === 'selected' ? selectedTenantId : null)
}
await router.push('/')
await router.isReady()
app.mount('#app')
