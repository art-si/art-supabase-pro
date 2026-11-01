import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { setupGlobDirectives } from '@/directives'
import CustomerDialog from '@tms/views/basic-data/customer/modules/customer-dialog.vue'
import CarrierDialog from '@tms/views/basic-data/carrier/modules/carrier-dialog.vue'
import CustomerAddressDialog from '@tms/views/basic-data/customer-address/modules/customer-address-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

type CoordinateCase = 'range' | 'half' | 'negative'

const tenantId = '11111111-1111-4111-8111-111111111111'
const customerRef = ref<InstanceType<typeof CustomerDialog>>()
const carrierRef = ref<InstanceType<typeof CarrierDialog>>()
const addressRef = ref<InstanceType<typeof CustomerAddressDialog>>()
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

const openCarrier = (isNew = false): void => {
  void carrierRef.value?.handleOpen(
    isNew
      ? undefined
      : {
          id: 'carrier-1',
          carrierCode: 'CARRIER-001',
          companyName: '当前承运商',
          carrierType: 'enterprise',
          carrierTypes: ['enterprise'],
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
      h('button', { type: 'button', onClick: () => openCarrier(true) }, '新增承运商'),
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
const allTenants = new URLSearchParams(location.search).get('scope') === 'all'
useUserStore(store).setUserInfo({
  userId: 'tms-coordinate-test',
  tenantId,
  platformSuper: allTenants
})
if (allTenants) {
  const scope = useTenantScopeStore(store)
  scope.scopeOwnerUserId = 'tms-coordinate-test'
  scope.setTenantScope(null)
}
await router.push('/')
await router.isReady()
app.mount('#app')
