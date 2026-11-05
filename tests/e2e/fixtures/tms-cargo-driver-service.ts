import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '11111111-1111-4111-8111-111111111111'
const kind = new URLSearchParams(location.search).get('kind') || 'cargo'
const component =
  kind === 'service-detail'
    ? (await import('@tms/views/basic-data/service-case/index.vue')).default
    : kind === 'driver-list'
      ? (await import('@tms/views/basic-data/driver/index.vue')).default
      : kind === 'driver' || kind === 'driver-review'
        ? (await import('@tms/views/basic-data/driver/modules/driver-dialog.vue')).default
        : kind === 'service'
          ? (await import('@tms/views/basic-data/service-case/modules/service-case-dialog.vue'))
              .default
          : (await import('@tms/views/basic-data/cargo/modules/cargo-dialog.vue')).default
const app = createApp(component)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }]
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
const user = useUserStore(store)
user.setUserInfo({
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId,
  tenant: { tenantCode: 'visual-test', tenantName: '验收运输公司' },
  platformSuper: false
} as Api.Auth.UserInfo)
user.setDictMap({
  tmsServiceType: [
    { name: '投诉', code: 'complaint', value: 'complaint', label: '投诉', status: '1' },
    { name: '咨询', code: 'consultation', value: 'consultation', label: '咨询', status: '1' }
  ],
  tmsComplaintType: [
    { name: '时效', code: 'timeliness', value: 'timeliness', label: '时效', status: '1' }
  ],
  tmsServiceCaseStatus: [
    { name: '待回复', code: 'pending', value: 'pending', label: '待回复', status: '1' }
  ],
  tmsDispatchOperatorMode: [
    { name: '承运方', code: 'carrier', value: 'carrier', label: '承运方', status: '1' },
    { name: '自营', code: 'self_operated', value: 'self_operated', label: '自营', status: '1' },
    {
      name: '个体司机',
      code: 'individual_driver',
      value: 'individual_driver',
      label: '个体司机',
      status: '1'
    }
  ],
  hrEthnicity: [],
  tmsDriverOwnership: [
    { name: '自营司机', code: 'self', value: 'self', label: '自营司机', status: '1' },
    { name: '承运商司机', code: 'carrier', value: 'carrier', label: '承运商司机', status: '1' }
  ],
  tmsDriverStatus: [
    { name: '在岗', code: 'on_duty', value: 'on_duty', label: '在岗', status: '1' }
  ],
  tmsDriverType: [{ name: '主驾', code: 'primary', value: 'primary', label: '主驾', status: '1' }],
  tmsDriverRegistrationStatus: [
    { name: '未注册', code: 'unregistered', value: 'unregistered', label: '未注册', status: '1' }
  ],
  tmsDriverAuthStatus: [
    { name: '未认证', code: 'unverified', value: 'unverified', label: '未认证', status: '1' },
    { name: '已认证', code: 'verified', value: 'verified', label: '已认证', status: '1' },
    {
      name: '企业内保存',
      code: 'internal_saved',
      value: 'internal_saved',
      label: '企业内保存',
      status: '1'
    }
  ]
})
user.ensureDictLoaded = async () => undefined
useTenantScopeStore(store).selectedTenantId = tenantId
useMenuStore(store).setButtonList([
  ...['View', 'Add', 'Edit', 'Reply', 'Delete', 'Export'].map((action) => ({
    name: `TmsServiceCase:${action}`,
    path: '',
    type: 'button',
    meta: { title: action }
  })),
  ...['View', 'Add', 'Edit', 'Delete', 'UploadDocument', 'Audit'].map((action) => ({
    name: `TmsDriver:${action}`,
    path: '',
    type: 'button',
    meta: { title: action }
  }))
])
const preview = app.mount('#tms-cargo-driver-service') as unknown as {
  handleOpen: (...args: unknown[]) => Promise<void>
}
await nextTick()
if (kind === 'service-detail' || kind === 'driver-list') {
  // The list page opens its detail dialog when the service number is clicked.
} else if (kind === 'driver' || kind === 'driver-review') {
  void preview.handleOpen(
    {
      id: '33333333-3333-4333-8333-333333333333',
      tenantId,
      carrierId: null,
      driverName: '验收司机',
      phone: '138****0001',
      gender: 'male',
      licenseType: 'A2',
      driverType: 'primary',
      companyName: '验收运输公司'
    },
    undefined,
    undefined,
    undefined,
    kind === 'driver'
  )
} else if (kind === 'service') {
  void preview.handleOpen()
} else if (kind === 'cargo-edit') {
  void preview.handleOpen({
    groups: [],
    row: {
      id: '77777777-7777-4777-8777-777777777777',
      tenantId,
      materialId: '88888888-8888-4888-8888-888888888888',
      cargoCode: 'B00-0039',
      cargoName: '验收支撑架',
      unit: 'U05',
      enabled: true,
      material: {
        id: '88888888-8888-4888-8888-888888888888',
        materialCode: 'B00-0039',
        materialName: '验收支撑架',
        basicUnit: 'U05',
        baseUnit: { unitName: '件' }
      }
    }
  })
} else {
  void preview.handleOpen({ groups: [] })
}
