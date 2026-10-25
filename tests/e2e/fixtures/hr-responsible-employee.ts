import { createApp, defineAsyncComponent, h, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { setupGlobDirectives } from '@/directives'
import type OrganizationComponent from '../../../modules/art-supabase-hr/src/views/personnel/organization-design/modules/organization-design-dialog.vue'
import type ContingentComponent from '../../../modules/art-supabase-hr/src/views/operations/contingent-workforce/modules/contingent-workforce-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const feature = new URLSearchParams(location.search).get('feature')
const child = new URLSearchParams(location.search).has('child')
const otherScope = new URLSearchParams(location.search).has('other-scope')
const tenantId = '11111111-1111-4111-8111-111111111111'
const OrganizationDialog = defineAsyncComponent(
  () =>
    import('../../../modules/art-supabase-hr/src/views/personnel/organization-design/modules/organization-design-dialog.vue')
)
const ContingentDialog = defineAsyncComponent(
  () =>
    import('../../../modules/art-supabase-hr/src/views/operations/contingent-workforce/modules/contingent-workforce-dialog.vue')
)
const app = createApp({
  setup() {
    const organization = shallowRef<InstanceType<typeof OrganizationComponent>>()
    const contingent = shallowRef<InstanceType<typeof ContingentComponent>>()
    const openOrganization = () =>
      void organization.value?.handleOpen({
        entity: child ? 'change' : 'scenario',
        type: child ? 'add' : 'edit',
        ...(child
          ? {
              scenario: {
                id: 'scenario-001',
                tenantId,
                scenarioCode: 'SCENARIO-001',
                scenarioName: '测试方案',
                objective: '测试组织变革',
                effectiveDate: '2026-11-01',
                status: 'draft',
                riskLevel: 'unassessed',
                version: 1
              }
            }
          : {}),
        editData: child
          ? undefined
          : {
              id: 'scenario-001',
              tenantId,
              scenarioCode: 'SCENARIO-001',
              scenarioName: '测试方案',
              objective: '测试组织变革',
              effectiveDate: '2026-11-01',
              ownerEmployeeId: 'employee-001',
              ownerEmployeeName: '测试负责人',
              ownerEmployeeNo: 'EMP-001',
              status: 'draft',
              riskLevel: 'unassessed',
              version: 1
            }
      })
    const openContingent = () =>
      void contingent.value?.handleOpen({
        entity: child ? 'control' : 'engagement',
        type: child ? 'add' : 'edit',
        ...(child
          ? {
              engagement: {
                id: 'engagement-001',
                tenantId,
                engagementNo: 'EXT-001',
                workerId: 'worker-001',
                organizationId: 'organization-001',
                serviceTitle: '测试服务',
                startDate: '2026-10-01',
                endDate: '2026-11-01',
                accessExpiryDate: '2026-11-01',
                sponsorEmployeeId: 'employee-001',
                fte: 1,
                complianceStatus: 'pending',
                status: 'draft',
                version: 1
              }
            }
          : {}),
        editData: child
          ? undefined
          : {
              id: 'engagement-001',
              tenantId,
              engagementNo: 'EXT-001',
              workerId: 'worker-001',
              organizationId: 'organization-001',
              positionId: 'position-001',
              sponsorEmployeeId: 'employee-001',
              sponsorEmployeeName: '测试负责人',
              serviceTitle: '测试服务',
              startDate: '2026-10-01',
              endDate: '2026-11-01',
              accessExpiryDate: '2026-11-01',
              fte: 1,
              complianceStatus: 'pending',
              status: 'draft',
              version: 1
            }
      })
    return () =>
      feature === 'organization'
        ? h(OrganizationDialog, { ref: organization, onVnodeMounted: openOrganization })
        : h(ContingentDialog, { ref: contingent, onVnodeMounted: openContingent })
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({ userId: 'hr-owner-test', tenantId, platformSuper: otherScope })
if (otherScope) useTenantScopeStore(store).selectedTenantId = '22222222-2222-4222-8222-222222222222'
app.mount('#hr-responsible-employee')
