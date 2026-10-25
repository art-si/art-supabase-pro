import { createApp, h, onMounted, onUnmounted, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import PositionPage from '../../../modules/art-supabase-hr/src/views/personnel/position/index.vue'
import EmployeeRosterPage from '../../../modules/art-supabase-hr/src/views/personnel/employee-roster/index.vue'
import CompliancePage from '../../../modules/art-supabase-hr/src/views/personnel/compliance/index.vue'
import HrWorkspacePage from '../../../modules/art-supabase-hr/src/views/shared/hr-workspace-page.vue'
import PerformancePage from '../../../modules/art-supabase-hr/src/views/talent/performance/index.vue'
import RecruitmentPage from '../../../modules/art-supabase-hr/src/views/recruitment/workbench/index.vue'
import GlobalReferenceFeedback from '@/components/business/master-data-delete-guard/global-reference-feedback.vue'
import { mittBus } from '@/utils/sys'
import type { DeleteReferenceContext } from '@/utils/supabase/delete-reference'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', redirect: '/hr/personnel/position' },
    { path: '/hr/personnel/employee-detail/:id', name: 'HrEmployeeDetail', component: {} },
    { path: '/hr/personnel/employee-roster', name: 'HrEmployeeRoster', component: {} },
    { path: '/hr/personnel/compliance', name: 'HrCompliance', component: {} },
    { path: '/hr/talent/development', name: 'HrDevelopment', component: {} },
    { path: '/hr/talent/performance', name: 'HrPerformance', component: {} },
    { path: '/hr/recruitment/workbench', name: 'HrRecruitment', component: {} },
    { path: '/hr/personnel/position', name: 'HrPosition', component: {} }
  ]
})
const app = createApp({
  setup() {
    const referenceContext = shallowRef<DeleteReferenceContext>()
    const showReferences = (context: DeleteReferenceContext) => {
      referenceContext.value = context
    }
    onMounted(() => mittBus.on('deleteReferenceBlocked', showReferences))
    onUnmounted(() => mittBus.off('deleteReferenceBlocked', showReferences))
    return () =>
      h('main', { class: 'art-page-view', style: { height: '100vh', overflow: 'auto' } }, [
        h(
          'button',
          {
            hidden: true,
            'data-testid': 'revoke-delete-permission',
            onClick: () => {
              useUserStore(store).setUserInfo({
                userId: 'permission-test-user',
                tenantId: 'permission-test-tenant',
                platformSuper: false
              })
              useMenuStore(store).setButtonList([])
            }
          },
          '模拟权限更新'
        ),
        router.currentRoute.value.path === '/hr/talent/development'
          ? h(HrWorkspacePage, {
              workspaceKey: 'talent',
              permissions: {
                view: 'Hr:Development:View',
                add: 'Hr:Development:Add',
                edit: 'Hr:Development:Edit',
                delete: 'Hr:Development:Delete'
              }
            })
          : h(
              router.currentRoute.value.path === '/hr/personnel/employee-roster'
                ? EmployeeRosterPage
                : router.currentRoute.value.path === '/hr/personnel/compliance'
                  ? CompliancePage
                  : router.currentRoute.value.path === '/hr/talent/performance'
                    ? PerformancePage
                    : router.currentRoute.value.path === '/hr/recruitment/workbench'
                      ? RecruitmentPage
                      : PositionPage
            ),
        referenceContext.value
          ? h(GlobalReferenceFeedback, { context: referenceContext.value })
          : null,
        h(
          'output',
          { 'data-testid': 'navigation-path', hidden: true },
          router.currentRoute.value.path
        ),
        h(
          'output',
          { 'data-testid': 'navigation-full-path', hidden: true },
          router.currentRoute.value.fullPath
        )
      ])
  }
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
const limited = new URLSearchParams(location.search).get('permission') === 'employee-only'
const locationMode = new URLSearchParams(location.search).has('location')
useUserStore(store).setUserInfo({
  userId: 'permission-test-user',
  tenantId: 'permission-test-tenant',
  platformSuper: !limited && !locationMode
})
if (limited)
  useMenuStore(store).setButtonList(
    ['Hr:Employee:View', 'Hr:Employee:Delete'].map((name) => ({
      name,
      path: '',
      type: 'button',
      meta: { title: name }
    }))
  )
if (locationMode)
  useMenuStore(store).setButtonList([
    { name: 'Hr:Compliance:View', path: '', type: 'button', meta: { title: '用工合规查看' } },
    { name: 'Hr:Employee:View', path: '', type: 'button', meta: { title: '员工档案查看' } }
  ])
await router.push(
  new URLSearchParams(location.search).get('page') === 'performance'
    ? '/hr/talent/performance'
    : new URLSearchParams(location.search).get('page') === 'workspace'
      ? '/hr/talent/development'
      : new URLSearchParams(location.search).get('page') === 'compliance'
        ? {
            path: '/hr/personnel/compliance',
            query: {
              fromMasterDelete: '1',
              dependencyCode:
                new URLSearchParams(location.search).get('entity') === 'qualification'
                  ? 'hr_employee_qualification'
                  : 'hr_employee_contract',
              recordId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
              recordNo:
                new URLSearchParams(location.search).get('entity') === 'qualification'
                  ? 'QUAL-001'
                  : 'CONTRACT-001'
            }
          }
        : new URLSearchParams(location.search).get('page') === 'employee'
          ? {
              path: '/hr/personnel/employee-roster',
              query: locationMode
                ? {
                    fromMasterDelete: '1',
                    recordId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
                  }
                : {}
            }
          : '/hr/personnel/position'
)
await router.isReady()
app.mount('#hr-delete-workflows')
