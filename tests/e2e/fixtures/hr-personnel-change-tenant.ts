import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { writePlatformTenantScopeActive, writeTenantScopeId } from '@/utils/tenant-scope-context'
import PersonnelChangeDialog from '../../../modules/art-supabase-hr/src/views/personnel/personnel-change/modules/personnel-change-dialog.vue'
import { hrWorkspaceDefinitions } from '../../../modules/art-supabase-hr/src/views/shared/workspace-config'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const platformTenantId = '55555555-5555-4555-8555-555555555555'
const businessTenantId = '11111111-1111-4111-8111-111111111111'
const employeeId = '66666666-6666-4666-8666-666666666666'
const isEditing = new URLSearchParams(window.location.search).get('edit') !== '0'

const app = createApp(PersonnelChangeDialog)
app.use(store)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
app.use(language)
setupGlobDirectives(app)

const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId: platformTenantId,
  tenant: { tenantCode: 'platform', tenantName: '平台管理员租户', builtinType: 'platform' },
  platformSuper: true
} as Api.Auth.UserInfo)

const tenantScopeStore = useTenantScopeStore(store)
tenantScopeStore.selectedTenantId = null
writePlatformTenantScopeActive(true)
writeTenantScopeId(null)

const workspace = hrWorkspaceDefinitions.personnelChange
const preview = app.mount('#hr-personnel-change-preview') as unknown as {
  handleOpen: (data: {
    workspace: typeof workspace
    tab: (typeof workspace.tabs)[number]
    record?: Api.Hr.WorkspaceRecord
  }) => Promise<void>
}
void preview.handleOpen({
  workspace,
  tab: workspace.tabs[0],
  record: isEditing
    ? {
        id: '33333333-3333-4333-8333-333333333333',
        tenantId: businessTenantId,
        changeNo: 'PC-2026-001',
        employeeId,
        employee: { id: employeeId, employeeNo: 'EMP-001', employeeName: '测试员工' },
        changeType: 'promotion',
        effectiveDate: '2026-10-01',
        reason: '岗位晋升',
        beforeAssignmentSnapshot: {
          organizationId: '77777777-7777-4777-8777-777777777777',
          organizationName: '测试部门',
          positionId: '88888888-8888-4888-8888-888888888888',
          positionName: '测试岗位'
        }
      }
    : undefined
})
