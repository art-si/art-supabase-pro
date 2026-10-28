import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { setupGlobDirectives } from '@/directives'
import VehicleInsuranceDialog from '@vms/views/vehicle-manage/vehicle-insurance/modules/vehicle-insurance-dialog.vue'
import VehicleArchiveEdit from '@vms/views/vehicle-archive-edit/index.vue'
import AccidentRecordDialog from '@vms/views/vehicle-manage/accident-record/modules/accident-record-dialog.vue'
import MaintenanceRecordDialog from '@vms/views/vehicle-manage/maintenance-record/modules/maintenance-record-dialog.vue'
import RoutineInspectionDialog from '@vms/views/vehicle-manage/routine-inspection/modules/routine-inspection-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const scenario = new URLSearchParams(location.search).get('scenario')
const appearance = new URLSearchParams(location.search).get('appearance')
const tenantId = '11111111-1111-4111-8111-111111111111'
const otherTenantId = '22222222-2222-4222-8222-222222222222'
const insuranceRef = ref<InstanceType<typeof VehicleInsuranceDialog>>()
const accidentRef = ref<InstanceType<typeof AccidentRecordDialog>>()
const maintenanceRef = ref<InstanceType<typeof MaintenanceRecordDialog>>()
const routineRef = ref<InstanceType<typeof RoutineInspectionDialog>>()
const existingInsurance = {
  id: 'insurance-1',
  tenantId,
  fieldAccess: { documents: 'edit' },
  attachments: [
    { name: '旧保单', url: 'https://example.invalid/shared.pdf', fileType: 'pdf' },
    { name: '新保单', url: 'https://example.invalid/shared.pdf', fileType: 'pdf' }
  ]
} as Api.Vms.VehicleManage.VehicleInsurance

const app = createApp({
  render: () => {
    const mainProps = { class: 'art-page-view', style: { padding: '16px' } }
    if (scenario === 'archive') return h('main', mainProps, [h(VehicleArchiveEdit)])
    if (scenario === 'accident')
      return h('main', mainProps, [
        h(
          'button',
          { type: 'button', onClick: () => void accidentRef.value?.handleOpen() },
          '新增事故记录'
        ),
        h(AccidentRecordDialog, { ref: accidentRef })
      ])
    if (scenario === 'maintenance' || scenario === 'maintenance-tenant-switch')
      return h('main', mainProps, [
        h(
          'button',
          { type: 'button', onClick: () => void maintenanceRef.value?.handleOpen() },
          '新增维修保养记录'
        ),
        h(MaintenanceRecordDialog, { ref: maintenanceRef })
      ])
    if (scenario === 'routine')
      return h('main', mainProps, [
        h(
          'button',
          { type: 'button', onClick: () => void routineRef.value?.handleOpen() },
          '新增例检记录'
        ),
        h(RoutineInspectionDialog, { ref: routineRef })
      ])
    return h('main', mainProps, [
      h(
        'button',
        {
          type: 'button',
          onClick: () => void insuranceRef.value?.handleOpen(existingInsurance)
        },
        '编辑保险'
      ),
      h(VehicleInsuranceDialog, { ref: insuranceRef })
    ])
  }
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: {} },
    { path: '/vms/vehicle-archive-edit/:id', component: {} }
  ]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({ userId: 'attachment-test', tenantId, platformSuper: true })
const tenantScope = useTenantScopeStore(store)
tenantScope.tenantOptions = [
  { id: tenantId, tenantCode: 'A', tenantName: '测试租户' },
  { id: otherTenantId, tenantCode: 'B', tenantName: '另一测试租户' }
]
tenantScope.setTenantScope(tenantId)
if (scenario === 'maintenance-tenant-switch') tenantScope.setTenantScope(null)
const setting = useSettingStore(store)
const theme = appearance === 'dark-shadow' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
setting.setGlobalTheme(theme, theme)
setting.boxBorderMode = appearance !== 'dark-shadow'
initializeTheme()
await router.push(scenario === 'archive' ? '/vms/vehicle-archive-edit/archive-1' : '/')
await router.isReady()
app.mount('#app')
