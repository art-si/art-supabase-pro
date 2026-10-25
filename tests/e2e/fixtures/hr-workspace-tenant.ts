import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { writePlatformTenantScopeActive, writeTenantScopeId } from '@/utils/tenant-scope-context'
import WorkspaceRecordDialog from '../../../modules/art-supabase-hr/src/views/shared/workspace-record-dialog.vue'
import {
  hrWorkspaceDefinitions,
  type HrWorkspaceDefinition,
  type HrWorkspaceTab
} from '../../../modules/art-supabase-hr/src/views/shared/workspace-config'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const platformTenantId = '55555555-5555-4555-8555-555555555555'
const businessTenantId = '11111111-1111-4111-8111-111111111111'
const recordId = '33333333-3333-4333-8333-333333333333'
const employeeId = '66666666-6666-4666-8666-666666666666'
const params = new URLSearchParams(window.location.search)
const mode = params.get('mode') ?? 'platform-all'
const scenario = params.get('scenario') ?? 'headcount'
const isPlatformSuper = mode === 'platform-all' || mode === 'platform-selected'
const homeTenantId = isPlatformSuper ? platformTenantId : businessTenantId

const app = createApp(WorkspaceRecordDialog)
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
  tenantId: homeTenantId,
  tenant: {
    tenantCode: isPlatformSuper ? 'platform' : 'business',
    tenantName: isPlatformSuper ? '平台管理员租户' : '业务租户',
    builtinType: isPlatformSuper ? 'platform' : 'business'
  },
  platformSuper: isPlatformSuper
} as Api.Auth.UserInfo)

const tenantScopeStore = useTenantScopeStore(store)
tenantScopeStore.selectedTenantId = mode === 'platform-selected' ? businessTenantId : null
writePlatformTenantScopeActive(isPlatformSuper)
writeTenantScopeId(
  mode === 'ordinary-forged' ? platformTenantId : tenantScopeStore.selectedTenantId
)

const workspace: HrWorkspaceDefinition =
  scenario === 'recruitment'
    ? hrWorkspaceDefinitions.recruitment
    : scenario === 'employee'
      ? hrWorkspaceDefinitions.talent
      : hrWorkspaceDefinitions.headcount
const tab: HrWorkspaceTab =
  scenario === 'employee'
    ? (workspace.tabs.find((item) => item.key === 'employeeMatrix') ?? workspace.tabs[0])
    : workspace.tabs[0]
const record: Api.Hr.WorkspaceRecord | undefined =
  params.get('edit') === '1'
    ? {
        id: recordId,
        tenantId: businessTenantId,
        approvedCount: 3,
        effectiveFrom: '2026-10-01',
        requisitionNo: 'HR-2026-001',
        openingCount: 1,
        employmentType: 'full_time',
        reason: '岗位补充',
        employeeId,
        employee: { id: employeeId, employeeNo: 'EMP-001', employeeName: '测试员工' },
        assessedDate: '2026-10-01',
        currentLevel: 'basic'
      }
    : undefined

const preview = app.mount('#hr-workspace-preview') as unknown as {
  handleOpen: (data: {
    workspace: HrWorkspaceDefinition
    tab: HrWorkspaceTab
    record?: Api.Hr.WorkspaceRecord
  }) => Promise<void>
}
void preview.handleOpen({ workspace, tab, record })
