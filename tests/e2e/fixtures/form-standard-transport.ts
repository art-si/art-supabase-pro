import { createApp, defineAsyncComponent, h, ref, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElButton, ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { setupGlobDirectives } from '@/directives'
import { readonlyEntries } from './form-standard-readonly-data'
import { vehicleEntries } from './form-standard-vehicle-data'
import { tmsEntries } from './form-standard-tms-data'
import { nativeDetailEntries } from './form-standard-native-detail-data'
import { formStandardTransportDictionaries } from './form-standard-transport-dictionaries'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '11111111-1111-4111-8111-111111111111'
const id = '22222222-2222-4222-8222-222222222222'
const referenceId = '33333333-3333-4333-8333-333333333333'
const params = new URLSearchParams(location.search)
const common = { id, tenantId, enabled: true, status: '1', remark: '验收备注' }
const fieldAccess = {
  contactPhone: 'edit',
  addressDetail: 'edit',
  taxNo: 'edit',
  bankAccount: 'edit',
  attachments: 'edit'
}
type Entry = { load: () => Promise<{ default: Component }>; args: () => unknown[]; page?: boolean }
const entries: Record<string, Entry> = {
  ...readonlyEntries,
  ...vehicleEntries,
  ...tmsEntries,
  ...nativeDetailEntries,
  'equipment-detail': {
    load: () => import('@mdm/views/engineering/production-equipment/index.vue'),
    args: () => [],
    page: true
  },
  cargo: {
    load: () => import('@tms/views/basic-data/cargo/modules/cargo-dialog.vue'),
    args: () => [
      {
        groups: [],
        row: {
          ...common,
          materialId: referenceId,
          cargoCode: 'MAT-TEST',
          cargoName: '验收货物',
          specModel: '验收规格',
          unit: '件',
          weightKg: 10
        }
      }
    ]
  },
  carrier: {
    load: () => import('@tms/views/basic-data/carrier/modules/carrier-dialog.vue'),
    args: () => [
      {
        ...common,
        carrierCode: 'CARRIER-TEST',
        companyName: '验收承运商',
        carrierType: 'enterprise',
        carrierTypes: ['enterprise'],
        dispatchChannels: ['offline'],
        fieldAccess,
        isRecordOwner: true
      }
    ]
  },
  customer: {
    load: () => import('@tms/views/basic-data/customer/modules/customer-dialog.vue'),
    args: () => [
      {
        groups: [],
        row: {
          ...common,
          customerCode: 'CUSTOMER-TEST',
          customerName: '验收客户',
          fieldAccess,
          tags: []
        }
      }
    ]
  },
  service: {
    load: () => import('@tms/views/basic-data/service-case/modules/service-case-dialog.vue'),
    args: () => [
      {
        ...common,
        serviceNo: 'SERVICE-TEST',
        serviceType: 'inquiry',
        complaintTypes: [],
        title: '验收服务咨询',
        contactName: '验收联系人',
        contactPhone: '13800000000',
        content: '请核对运输服务进度。',
        attachments: [],
        status: 'pending'
      }
    ]
  },
  station: {
    load: () => import('@tms/views/station/modules/station-dialog.vue'),
    args: () => [
      {
        ...common,
        stationCode: 'STATION-TEST',
        stationName: '验收站点',
        stationType: 'shipping',
        sort: 0
      }
    ]
  },
  supplier: {
    load: () => import('@vms/views/basic-info/supplier/modules/supplier-dialog.vue'),
    args: () => [
      {
        ...common,
        supplierName: '验收车辆供应商',
        fieldAccess: {
          contactDetails: 'edit',
          addressDetails: 'edit',
          remark: 'edit',
          internalNotes: 'edit'
        }
      }
    ]
  },
  insurance: {
    load: () =>
      import('@vms/views/basic-info/insurance-company/modules/insurance-company-dialog.vue'),
    args: () => [{ ...common, companyName: '验收保险公司' }]
  },
  'parts-category': {
    load: () => import('@vms/views/basic-info/parts-category/modules/parts-category-dialog.vue'),
    args: () => [
      {
        ...common,
        categoryName: '验收零件类别',
        categoryCode: 'PART_CATEGORY',
        categoryLevel: 1,
        sort: 1,
        parentId: null
      }
    ]
  },
  parts: {
    load: () => import('@vms/views/basic-info/parts/modules/parts-dialog.vue'),
    args: () => [
      {
        ...common,
        partCode: 'PART-TEST',
        partName: '验收零部件',
        categoryId: referenceId,
        unit: '件'
      }
    ]
  }
}
entries['carrier-restricted'] = entries.carrier
entries['customer-restricted'] = entries.customer
const entry = entries[params.get('entry') || 'cargo']
const openArgs = () => {
  const args = entry.args()
  const initial = args[0]
  if (params.get('entry')?.endsWith('-restricted') && initial && typeof initial === 'object') {
    const row = 'row' in initial ? initial.row : undefined
    args[0] =
      row && typeof row === 'object'
        ? { ...initial, row: { ...row, fieldAccess: {} } }
        : { ...initial, fieldAccess: {} }
  }
  return args
}
const CurrentDialog = defineAsyncComponent(entry.load)
const app = createApp({
  setup() {
    const dialog = ref<{ handleOpen: (...args: unknown[]) => Promise<void> }>()
    const saved = ref('尚未保存')
    return () =>
      h(ElConfigProvider, { locale: zhCn }, () =>
        h('main', { class: 'p-4' }, [
          !entry.page &&
            h(
              ElButton,
              { disabled: !dialog.value, onClick: () => dialog.value?.handleOpen(...openArgs()) },
              () => '打开真实业务入口'
            ),
          h('output', { 'data-testid': 'save-result' }, saved.value),
          h(CurrentDialog, {
            ref: dialog,
            onSuccess: () => {
              saved.value = '已保存'
            }
          })
        ])
      )
  }
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', name: 'TmsElectronicContract', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
const user = useUserStore(store)
user.setUserInfo({
  userId: 'form-standard-test',
  tenantId,
  platformSuper: true
} as Api.Auth.UserInfo)
const scope = useTenantScopeStore(store)
scope.tenantOptions = [
  { id: tenantId, tenantCode: 'TEST', tenantName: '验收租户', builtinType: 'business' }
]
scope.scopeOwnerUserId = 'form-standard-test'
scope.setTenantScope(tenantId)
user.setDictMap(formStandardTransportDictionaries)
const settings = useSettingStore(store)
const theme = params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
settings.setGlobalTheme(theme, theme)
initializeTheme()
await router.push('/')
await router.isReady()
app.mount('#app')
