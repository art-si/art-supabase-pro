import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import PmisDepartmentSettingWorkspace from '@pmis/views/components/department-setting-workspace.vue'
import PmisDepartmentNavigator from '@pmis/views/components/department-navigator.vue'
import PmisInspectionDashboardWorkspace from '@pmis/views/components/inspection-dashboard-workspace.vue'
import PmisDepartmentSettingDialog, {
  type SettingDialogOpenData
} from '@pmis/views/components/department-setting-dialog.vue'
import type { PmisDepartmentSetting } from '@pmis/api'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const scope = useTenantScopeStore(store)
const search = new URLSearchParams(location.search)
const view = search.get('view') || 'setting'
const kind = search.get('kind') === 'repair' ? 'repair' : 'maintenance'
const dialogRef = ref<{ handleOpen: (data: SettingDialogOpenData) => Promise<void> }>()
const notificationRow: PmisDepartmentSetting = {
  id: 'setting-1',
  tenantId: tenantA,
  settingKind: kind,
  departmentId: 'department-1',
  requireAlbumPhoto: false,
  notificationMethods: [],
  urgencyRules: [],
  department: {
    id: 'department-1',
    tenantId: tenantA,
    departmentCode: 'D-1',
    departmentName: '生产部门 1'
  },
  employees: [],
  escalationRules: [
    { id: 'rule-1', delayMinutes: 60, notificationMethods: [], notifyEmployeeIds: ['employee-1'] }
  ]
}

const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view min-w-0 p-4' }, [
      h('button', { type: 'button', onClick: () => scope.setTenantScope(tenantB) }, '切换租户 B'),
      view === 'navigator'
        ? h(PmisDepartmentNavigator)
        : view === 'dashboard'
          ? h(PmisInspectionDashboardWorkspace)
          : view === 'dialog'
            ? [
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () =>
                      void dialogRef.value?.handleOpen({
                        kind,
                        tenantId: tenantA,
                        row: search.get('row') === 'notification' ? notificationRow : undefined
                      })
                  },
                  '打开部门设置弹窗'
                ),
                h(PmisDepartmentSettingDialog, { ref: dialogRef })
              ]
            : h(PmisDepartmentSettingWorkspace, { kind })
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
useUserStore(store).setUserInfo({
  userId: 'pmis-department-read-test',
  tenantId: tenantA,
  platformSuper: true
})
scope.tenantOptions = [
  { id: tenantA, tenantCode: 'A', tenantName: '租户 A' },
  { id: tenantB, tenantCode: 'B', tenantName: '租户 B' }
]
scope.setTenantScope(tenantA)
await router.push('/')
await router.isReady()
app.mount('#app')
