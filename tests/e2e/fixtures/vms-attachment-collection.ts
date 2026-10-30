import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { setupGlobDirectives } from '@/directives'
import { useDraftAttachmentRemoval } from '@/hooks/core/useDraftAttachmentRemoval'
import VehicleInsuranceDialog from '@vms/views/vehicle-manage/vehicle-insurance/modules/vehicle-insurance-dialog.vue'
import VehicleArchiveEdit from '@vms/views/vehicle-archive-edit/index.vue'
import AccidentRecordDialog from '@vms/views/vehicle-manage/accident-record/modules/accident-record-dialog.vue'
import MaintenanceRecordDialog from '@vms/views/vehicle-manage/maintenance-record/modules/maintenance-record-dialog.vue'
import RoutineInspectionDialog from '@vms/views/vehicle-manage/routine-inspection/modules/routine-inspection-dialog.vue'
import VehicleInspectionDialog from '@vms/views/vehicle-manage/vehicle-inspection/modules/vehicle-inspection-dialog.vue'
import CertificateDialog from '@vms/views/certificate-center/modules/certificate-dialog.vue'
import type { CertificateRecord } from '@vms/types/certificate'
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
const inspectionRef = ref<InstanceType<typeof VehicleInspectionDialog>>()
const certificateRef = ref<InstanceType<typeof CertificateDialog>>()
const draftAttachments = (prefix: string) => [
  { name: `${prefix}旧保单`, url: 'https://example.invalid/shared.pdf', fileType: 'pdf' },
  { name: `${prefix}新保单`, url: 'https://example.invalid/shared.pdf', fileType: 'pdf' }
]
const existingInsurance = {
  id: 'insurance-1',
  tenantId,
  plateNo: '测A12345',
  fieldAccess: { documents: 'edit' },
  attachments: [
    { name: '旧保单', url: 'https://example.invalid/shared.pdf', fileType: 'pdf' },
    { name: '新保单', url: 'https://example.invalid/shared.pdf', fileType: 'pdf' }
  ]
} as Api.Vms.VehicleManage.VehicleInsurance
const insuranceB: Api.Vms.VehicleManage.VehicleInsurance = {
  ...existingInsurance,
  id: 'insurance-b',
  tenantId,
  plateNo: '测B67890',
  attachments: draftAttachments('B')
}
const insuranceAForRemoval: Api.Vms.VehicleManage.VehicleInsurance = {
  ...existingInsurance,
  id: 'insurance-a',
  attachments: draftAttachments('A'),
  isRecordOwner: true
}
const readOnlyAccident: Api.Vms.VehicleManage.VehicleAccidentRecord = {
  id: 'accident-readonly',
  tenantId,
  vehicleId: 'vehicle-a',
  plateNo: '测A12345',
  accidentTime: '2026-10-01T08:00:00Z',
  accidentSummary: '只读事故记录',
  reported: false,
  insuranceReported: false,
  processed: false,
  dataSource: 'self',
  attachments: [{ name: '只读附件', url: 'https://example.invalid/readonly.pdf', fileType: 'pdf' }],
  fieldAccess: { documents: 'read' },
  isRecordOwner: false
}
const accidentA: Api.Vms.VehicleManage.VehicleAccidentRecord = {
  ...readOnlyAccident,
  id: 'accident-a',
  accidentSummary: 'A 事故',
  attachments: draftAttachments('A'),
  fieldAccess: { documents: 'edit' },
  isRecordOwner: true
}
const accidentB: Api.Vms.VehicleManage.VehicleAccidentRecord = {
  ...accidentA,
  id: 'accident-b',
  accidentSummary: 'B 事故',
  attachments: draftAttachments('B')
}
const maintenanceA: Api.Vms.VehicleManage.VehicleMaintenanceRecord = {
  id: 'maintenance-a',
  tenantId,
  vehicleId: 'vehicle-a',
  plateNo: '测A12345',
  maintenanceNo: 'MAINT-A',
  maintenanceType: 'maintenance',
  startTime: '2026-10-30T08:00:00+08:00',
  externalRepair: false,
  attachments: draftAttachments('A'),
  fieldAccess: { documents: 'edit' },
  isRecordOwner: true
}
const maintenanceB: Api.Vms.VehicleManage.VehicleMaintenanceRecord = {
  ...maintenanceA,
  id: 'maintenance-b',
  plateNo: '测B67890',
  maintenanceNo: 'MAINT-B',
  attachments: draftAttachments('B')
}
const routineA: Api.Vms.VehicleManage.VehicleRoutineInspectionRecord = {
  id: 'routine-a',
  tenantId,
  vehicleId: 'vehicle-a',
  plateNo: '测A12345',
  inspectionType: 'daily',
  inspectionTime: '2026-10-30T08:00:00+08:00',
  attachments: draftAttachments('A'),
  fieldAccess: { documents: 'edit' },
  isRecordOwner: true
}
const routineB: Api.Vms.VehicleManage.VehicleRoutineInspectionRecord = {
  ...routineA,
  id: 'routine-b',
  plateNo: '测B67890',
  attachments: draftAttachments('B')
}
const inspectionA: Api.Vms.VehicleManage.VehicleInspection = {
  id: 'inspection-a',
  tenantId,
  vehicleId: 'vehicle-a',
  plateNo: '测A12345',
  inspectionNo: 'INSP-A',
  inspectionDate: '2026-10-30',
  attachments: draftAttachments('A'),
  fieldAccess: { documents: 'edit' },
  isRecordOwner: true
}
const inspectionB: Api.Vms.VehicleManage.VehicleInspection = {
  ...inspectionA,
  id: 'inspection-b',
  plateNo: '测B67890',
  inspectionNo: 'INSP-B',
  attachments: draftAttachments('B')
}
const certificateA: CertificateRecord = {
  id: 'certificate-a',
  tenantId,
  subjectType: 'vehicle',
  subjectId: 'vehicle-a',
  subjectLabel: '测A12345',
  certificateType: 'vehicle_registration',
  certificateNo: 'CERT-A',
  issueDate: '2026-10-01',
  validFrom: '2026-10-01',
  expiresOn: '2027-10-01',
  attachments: draftAttachments('A'),
  responsibleUserId: 'attachment-test',
  responsibleName: '测试责任人',
  renewalOfId: null,
  handledAt: null,
  handledBy: null,
  revokedAt: null,
  revokedOn: null,
  revokedBy: null,
  revokedReason: null,
  status: 'valid'
}
const certificateB: CertificateRecord = {
  ...certificateA,
  id: 'certificate-b',
  subjectId: 'vehicle-b',
  subjectLabel: '测B67890',
  certificateNo: 'CERT-B',
  attachments: draftAttachments('B')
}
const HookFaultHarness = defineComponent({
  setup() {
    const rows = ref(draftAttachments('异常'))
    const remove = useDraftAttachmentRemoval({
      getAttachments: () => rows.value,
      setAttachments: () => {
        throw new Error('TECHNICAL_SQLSTATE_INTERNAL_ATTACHMENT_FAILURE')
      },
      canRemove: () => true,
      getContext: () => ['hook-fault', tenantId]
    })
    return () =>
      h('main', { class: 'art-page-view p-4' }, [
        h('p', rows.value[0]?.name),
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              const row = rows.value[0]
              if (row) void remove(row)
            }
          },
          '删除测试附件'
        )
      ])
  }
})
const HookContextHarness = defineComponent({
  setup() {
    const rows = ref(draftAttachments('上下文'))
    const vehicleId = ref('vehicle-a')
    const remove = useDraftAttachmentRemoval({
      getAttachments: () => rows.value,
      setAttachments: (next) => {
        rows.value = next
      },
      canRemove: () => true,
      getContext: () => ['same-record', tenantId, vehicleId.value]
    })
    Object.assign(window, {
      __vmsHookContext: {
        switchVehicle() {
          vehicleId.value = 'vehicle-b'
        }
      }
    })
    return () =>
      h('main', { class: 'art-page-view p-4' }, [
        ...rows.value.map((row) => h('p', { key: row.name }, row.name)),
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              const row = rows.value[1]
              if (row) void remove(row)
            }
          },
          '删除上下文附件'
        )
      ])
  }
})

const app = createApp({
  render: () => {
    const mainProps = { class: 'art-page-view', style: { padding: '16px' } }
    if (scenario === 'hook-error') return h(HookFaultHarness)
    if (scenario === 'hook-context') return h(HookContextHarness)
    if (scenario === 'archive') return h('main', mainProps, [h(VehicleArchiveEdit)])
    if (scenario === 'archive-remove')
      return h('main', mainProps, [h(VehicleArchiveEdit, { key: router.currentRoute.value.path })])
    if (scenario === 'accident-remove')
      return h('main', mainProps, [h(AccidentRecordDialog, { ref: accidentRef })])
    if (scenario === 'maintenance-remove')
      return h('main', mainProps, [h(MaintenanceRecordDialog, { ref: maintenanceRef })])
    if (scenario === 'routine-remove')
      return h('main', mainProps, [h(RoutineInspectionDialog, { ref: routineRef })])
    if (scenario === 'inspection-remove')
      return h('main', mainProps, [h(VehicleInspectionDialog, { ref: inspectionRef })])
    if (scenario === 'certificate-remove')
      return h('main', mainProps, [h(CertificateDialog, { ref: certificateRef })])
    if (scenario === 'insurance-remove')
      return h('main', mainProps, [h(VehicleInsuranceDialog, { ref: insuranceRef })])
    if (scenario === 'accident')
      return h('main', mainProps, [
        h(
          'button',
          { type: 'button', onClick: () => void accidentRef.value?.handleOpen() },
          '新增事故记录'
        ),
        h(AccidentRecordDialog, { ref: accidentRef })
      ])
    if (scenario === 'accident-readonly')
      return h('main', mainProps, [
        h(
          'button',
          { type: 'button', onClick: () => void accidentRef.value?.handleOpen(readOnlyAccident) },
          '查看只读事故记录'
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
const userStore = useUserStore(store)
userStore.setUserInfo({ userId: 'attachment-test', tenantId, platformSuper: true })
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
await router.push(
  scenario === 'archive' || scenario === 'archive-remove'
    ? '/vms/vehicle-archive-edit/archive-1'
    : '/'
)
await router.isReady()
app.mount('#app')
if (scenario?.endsWith('-remove')) {
  Object.assign(window, {
    __vmsAttachmentRemoval: {
      openA() {
        if (scenario === 'archive-remove') return router.push('/vms/vehicle-archive-edit/archive-1')
        if (scenario === 'insurance-remove')
          return insuranceRef.value?.handleOpen(insuranceAForRemoval)
        if (scenario === 'accident-remove') return accidentRef.value?.handleOpen(accidentA)
        if (scenario === 'maintenance-remove') return maintenanceRef.value?.handleOpen(maintenanceA)
        if (scenario === 'inspection-remove') return inspectionRef.value?.handleOpen(inspectionA)
        if (scenario === 'certificate-remove') return certificateRef.value?.handleOpen(certificateA)
        return routineRef.value?.handleOpen(routineA)
      },
      openB(readOnly = false) {
        if (scenario === 'archive-remove')
          return router.push(
            `/vms/vehicle-archive-edit/${readOnly ? 'archive-b-readonly' : 'archive-b'}`
          )
        if (scenario === 'insurance-remove')
          return insuranceRef.value?.handleOpen({
            ...insuranceB,
            fieldAccess: { documents: readOnly ? 'read' : 'edit' },
            isRecordOwner: !readOnly
          })
        if (scenario === 'accident-remove')
          return accidentRef.value?.handleOpen({
            ...accidentB,
            fieldAccess: { documents: readOnly ? 'read' : 'edit' },
            isRecordOwner: !readOnly
          })
        if (scenario === 'maintenance-remove')
          return maintenanceRef.value?.handleOpen({
            ...maintenanceB,
            fieldAccess: { documents: readOnly ? 'read' : 'edit' },
            isRecordOwner: !readOnly
          })
        if (scenario === 'inspection-remove')
          return inspectionRef.value?.handleOpen({
            ...inspectionB,
            fieldAccess: { documents: readOnly ? 'read' : 'edit' },
            isRecordOwner: !readOnly
          })
        if (scenario === 'certificate-remove') return certificateRef.value?.handleOpen(certificateB)
        return routineRef.value?.handleOpen({
          ...routineB,
          fieldAccess: { documents: readOnly ? 'read' : 'edit' },
          isRecordOwner: !readOnly
        })
      },
      closeRecord() {
        if (scenario === 'archive-remove') return router.push('/')
        if (scenario === 'insurance-remove') return insuranceRef.value?.handleClose()
        if (scenario === 'accident-remove') return accidentRef.value?.handleClose()
        if (scenario === 'maintenance-remove') return maintenanceRef.value?.handleClose()
        if (scenario === 'inspection-remove') return inspectionRef.value?.handleClose()
        if (scenario === 'certificate-remove') return router.push('/')
        return routineRef.value?.handleClose()
      },
      switchTenantB() {
        tenantScope.setTenantScope(otherTenantId)
      },
      switchIdentityB() {
        userStore.setUserInfo({
          userId: 'attachment-other-user',
          tenantId: otherTenantId,
          platformSuper: false
        })
      }
    }
  })
}
