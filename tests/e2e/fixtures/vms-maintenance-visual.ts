import { createApp, h, ref } from 'vue'
import { ElButton, ElConfigProvider } from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import MaintenanceRecordDialog from '@vms/views/vehicle-manage/maintenance-record/modules/maintenance-record-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

type MaintenanceRecord = Api.Vms.VehicleManage.VehicleMaintenanceRecord
type DialogExpose = { handleOpen: (row?: MaintenanceRecord) => Promise<void> }

const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: 'maintenance-visual-user',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false,
  nickName: '验收经办人'
})
userStore.setLoginStatus(true)
userStore.setDictMap({
  vehicleMaintenanceType: [
    { value: 'routine', label: '常规保养', code: 'routine', status: '1', sort: 1 },
    { value: 'repair', label: '故障维修', code: 'repair', status: '1', sort: 2 },
    { value: 'accident', label: '事故维修', code: 'accident', status: '1', sort: 3 }
  ],
  commonBoolean: [
    { value: 'false', label: '否', code: 'false', status: '1', sort: 1 },
    { value: 'true', label: '是', code: 'true', status: '1', sort: 2 }
  ],
  vehicleOperationStatus: [
    { value: 'operating', label: '营运', code: 'operating', status: '1', sort: 1 }
  ]
})
useMenuStore(store).setButtonList(
  ['VehicleMaintenance:Add', 'VehicleMaintenance:Edit', 'VehicleMaintenance:View'].map((name) => ({
    name,
    path: '',
    type: 'button',
    meta: { title: name }
  }))
)

const historicalRecord: MaintenanceRecord = {
  id: '22222222-2222-4222-8222-222222222222',
  tenantId: '11111111-1111-4111-8111-111111111111',
  vehicleId: '33333333-3333-4333-8333-333333333333',
  plateNo: '测A·10001',
  companyName: '验收运输公司',
  maintenanceNo: 'WB2026001',
  maintenanceType: 'repair',
  initiator: '历史经办人',
  startTime: '2026-10-01 09:00:00',
  serviceDate: null,
  currentOdometerKm: null,
  reminderMode: 'time',
  externalRepair: false,
  costAmount: 300,
  items: [{ itemName: '故障检修', totalAmount: 300 }],
  attachments: [{ name: '维修单.jpg', url: 'https://example.test/repair.jpg' }],
  fieldAccess: {
    maintenanceIdentifiers: 'edit',
    totalCost: 'edit',
    maintenanceItems: 'edit',
    documents: 'edit'
  }
}

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/vms/vehicle-manage/maintenance-record', component: { render: () => null } }]
})

const app = createApp({
  setup() {
    const dialog = ref<DialogExpose>()
    return () =>
      h(ElConfigProvider, { locale: zhCn }, () =>
        h('main', { class: 'art-page-view min-h-screen p-6' }, [
          h(
            ElButton,
            { type: 'primary', onClick: () => void dialog.value?.handleOpen() },
            () => '新增维保'
          ),
          h(
            ElButton,
            { onClick: () => void dialog.value?.handleOpen(historicalRecord) },
            () => '编辑历史维保'
          ),
          h(MaintenanceRecordDialog, { ref: dialog })
        ])
      )
  }
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.push('/vms/vehicle-manage/maintenance-record')
await router.isReady()
app.mount('#vms-maintenance-visual')
