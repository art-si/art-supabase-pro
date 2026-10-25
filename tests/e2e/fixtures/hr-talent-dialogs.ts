import { createApp, h, onMounted, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import LearningDialog from '../../../modules/art-supabase-hr/src/views/talent/development/modules/learning-dialog.vue'
import PerformanceDialog from '../../../modules/art-supabase-hr/src/views/talent/performance/modules/performance-dialog.vue'
import SuccessionDialog from '../../../modules/art-supabase-hr/src/views/talent/succession/modules/succession-dialog.vue'
import LifecycleDialog from '../../../modules/art-supabase-hr/src/views/personnel/lifecycle/modules/lifecycle-dialog.vue'
import AttendanceDialog from '../../../modules/art-supabase-hr/src/views/operations/attendance/modules/attendance-dialog.vue'
import PlanningDialog from '../../../modules/art-supabase-hr/src/views/operations/headcount/modules/workforce-planning-dialog.vue'
import MobilityDialog from '../../../modules/art-supabase-hr/src/views/talent/internal-mobility/modules/internal-mobility-dialog.vue'
import AbsenceDialog from '../../../modules/art-supabase-hr/src/views/operations/absence/modules/absence-dialog.vue'
import CompensationDialog from '../../../modules/art-supabase-hr/src/views/operations/compensation/modules/compensation-dialog.vue'
import ExperienceResponse from '../../../modules/art-supabase-hr/src/views/operations/employee-experience/modules/experience-response-dialog.vue'
import Assignment from '../../../modules/art-supabase-hr/src/views/operations/self-service/modules/service-assignment-dialog.vue'
import Delivery from '../../../modules/art-supabase-hr/src/views/operations/self-service/modules/service-delivery-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const feature = params.get('feature') ?? 'learning'
const tenantId = '11111111-1111-4111-8111-111111111111'
const app = createApp({
  setup() {
    const learning = shallowRef<InstanceType<typeof LearningDialog>>()
    const performance = shallowRef<InstanceType<typeof PerformanceDialog>>()
    const succession = shallowRef<InstanceType<typeof SuccessionDialog>>()
    const lifecycle = shallowRef<InstanceType<typeof LifecycleDialog>>()
    const attendance = shallowRef<InstanceType<typeof AttendanceDialog>>()
    const planning = shallowRef<InstanceType<typeof PlanningDialog>>()
    const mobility = shallowRef<InstanceType<typeof MobilityDialog>>()
    const absence = shallowRef<InstanceType<typeof AbsenceDialog>>()
    const compensation = shallowRef<InstanceType<typeof CompensationDialog>>()
    const experience = shallowRef<InstanceType<typeof ExperienceResponse>>()
    const assignment = shallowRef<InstanceType<typeof Assignment>>()
    const delivery = shallowRef<InstanceType<typeof Delivery>>()
    onMounted(() => {
      if (feature === 'assignment' || feature === 'delivery') {
        const request: Api.Hr.ServiceRequest = {
          id: 'request-test',
          tenantId,
          requestNo: 'SERVICE-001',
          employeeId: 'employee-test',
          serviceId: 'service-test',
          service: {
            id: 'service-test',
            tenantId,
            name: '已停用服务项目',
            routingGroup: 'HR 服务台'
          },
          requestType: 'general',
          title: '测试服务工单',
          reason: '测试分派',
          priority: 'normal',
          channel: 'self_service',
          status: 'assigned',
          attachmentUrls: [],
          reopenCount: 0,
          assignedEmployeeId: '44444444-4444-4444-8444-444444444444',
          requester: { id: 'employee-test', code: 'EMP-REQUEST-001', name: '申请员工' },
          assignee: {
            id: '44444444-4444-4444-8444-444444444444',
            code: 'EMP-SERVICE-001',
            name: '服务处理人'
          }
        }
        if (feature === 'assignment') void assignment.value?.handleOpen(request)
        else
          void delivery.value?.handleOpen({
            entity: 'request',
            type: 'edit',
            managerView: true,
            editData: request
          })
      } else if (feature === 'experience') {
        void experience.value?.handleOpen({
          id: 'participant-test',
          tenantId,
          surveyId: 'survey-test',
          surveyCode: 'SURVEY-001',
          surveyName: '测试体验调查',
          surveyType: 'pulse',
          cadence: 'monthly',
          status: 'invited',
          assignedOn: '2026-10-07',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          minimumGroupSize: 5,
          questionCount: 1,
          availability: 'available'
        })
      } else if (feature === 'compensation') {
        void compensation.value?.handleOpen(
          params.get('entity') === 'plan'
            ? 'plan'
            : params.get('entity') === 'band'
              ? 'band'
              : 'component'
        )
      } else if (feature === 'absence') {
        void absence.value?.handleOpen(
          params.get('entity') === 'type'
            ? 'type'
            : params.get('entity') === 'policy'
              ? 'policy'
              : 'request'
        )
      } else if (feature === 'mobility') {
        void mobility.value?.handleOpen({ entity: 'opportunity', type: 'add', manageAccess: true })
      } else if (feature === 'planning') {
        void planning.value?.handleOpen(params.get('entity') === 'line' ? 'line' : 'cycle')
      } else if (feature === 'lifecycle') {
        const entity =
          params.get('entity') === 'template'
            ? 'template'
            : params.get('entity') === 'task'
              ? 'task'
              : 'case'
        void lifecycle.value?.handleOpen({ entity, type: 'add' })
      } else if (feature === 'attendance') {
        const entity =
          params.get('entity') === 'shift'
            ? 'shift'
            : params.get('entity') === 'correction'
              ? 'correction'
              : 'record'
        void attendance.value?.handleOpen({ entity, type: 'add' })
      } else if (feature === 'performance') {
        const entity = params.get('entity') === 'review' ? 'review' : 'cycle'
        void performance.value?.handleOpen({ entity, type: 'add' })
      } else if (feature === 'succession') {
        if (params.get('edit') === '1') {
          void succession.value?.handleOpen('plan', {
            id: '22222222-2222-4222-8222-222222222222',
            tenantId,
            planCode: 'SUCCESSION-001',
            planName: '测试继任计划',
            positionId: '33333333-3333-4333-8333-333333333333',
            position: {
              id: '33333333-3333-4333-8333-333333333333',
              tenantId,
              name: '已停用测试岗位',
              code: 'POSITION-OLD'
            },
            criticality: 'high',
            vacancyRisk: 'medium',
            businessImpact: 'high',
            targetSuccessors: 2,
            reviewCycleMonths: 6,
            nextReviewDate: '2027-04-07',
            ownerEmployeeId: '44444444-4444-4444-8444-444444444444',
            owner: {
              id: '44444444-4444-4444-8444-444444444444',
              tenantId,
              name: '测试负责人',
              code: 'EMP-001'
            },
            status: 'draft'
          })
        } else {
          void succession.value?.handleOpen('plan')
        }
      } else {
        const entity = params.get('entity') === 'session' ? 'session' : 'plan'
        void learning.value?.handleOpen(
          entity,
          params.get('edit') === '1'
            ? {
                id: '22222222-2222-4222-8222-222222222222',
                tenantId,
                planCode: 'LEARNING-001',
                planName: '测试培训计划',
                trainingType: 'internal',
                startDate: '2026-10-07',
                status: 'draft',
                mandatory: false,
                ownerEmployeeId: '44444444-4444-4444-8444-444444444444',
                owner: {
                  id: '44444444-4444-4444-8444-444444444444',
                  name: '培训负责人',
                  code: 'EMP-TRAIN-001'
                }
              }
            : undefined
        )
      }
    })
    return () =>
      feature === 'assignment'
        ? h(Assignment, { ref: assignment })
        : feature === 'delivery'
          ? h(Delivery, { ref: delivery })
          : feature === 'experience'
            ? h(ExperienceResponse, { ref: experience })
            : feature === 'compensation'
              ? h(CompensationDialog, { ref: compensation })
              : feature === 'absence'
                ? h(AbsenceDialog, { ref: absence })
                : feature === 'mobility'
                  ? h(MobilityDialog, { ref: mobility })
                  : feature === 'planning'
                    ? h(PlanningDialog, { ref: planning })
                    : feature === 'lifecycle'
                      ? h(LifecycleDialog, { ref: lifecycle })
                      : feature === 'attendance'
                        ? h(AttendanceDialog, { ref: attendance })
                        : feature === 'performance'
                          ? h(PerformanceDialog, { ref: performance })
                          : feature === 'succession'
                            ? h(SuccessionDialog, { ref: succession })
                            : h(LearningDialog, { ref: learning })
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'talent-form-test-user',
  tenantId,
  platformSuper: false
})
app.mount('#hr-talent-dialogs')
