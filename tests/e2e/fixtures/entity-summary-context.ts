import { createApp, h, nextTick, onMounted, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import CalendarDayTypeDialog from '../../../modules/art-supabase-mdm/src/views/production/calendar/modules/calendar-day-type-dialog.vue'
import HiddenHazardTaskActionDialog from '../../../modules/art-supabase-smis/src/views/dual-control-system/hidden-hazard-governance/hidden-hazard-inspection-task/modules/task-action-dialog.vue'
import type CalendarDayTypeDialogComponent from '../../../modules/art-supabase-mdm/src/views/production/calendar/modules/calendar-day-type-dialog.vue'
import type HiddenHazardTaskActionDialogComponent from '../../../modules/art-supabase-smis/src/views/dual-control-system/hidden-hazard-governance/hidden-hazard-inspection-task/modules/task-action-dialog.vue'
import type { SmisHiddenHazardInspectionTask } from '@smis/api'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const feature = new URLSearchParams(location.search).get('feature') ?? 'calendar'
const task: SmisHiddenHazardInspectionTask = {
  id: 'hidden-task-test',
  sourcePlanId: 'hidden-plan-test',
  sourcePlanNo: 'PLAN-2026-001',
  sourcePlanName: '储罐区年度隐患排查计划',
  taskNo: 'TASK-2026-001',
  inspectionObject: '危险化学品储罐区',
  inspectionTypeName: '专项检查',
  status: 'not_started',
  executorEmployeeId: 'employee-test',
  executorEmployeeName: '测试执行人',
  executorEmployeeNo: 'EMP-001',
  plannedStartAt: '2026-10-23T08:00:00+08:00',
  plannedEndAt: '2026-10-23T18:00:00+08:00',
  itemCount: 5,
  normalCount: 0,
  abnormalCount: 0,
  createTime: '2026-10-23T08:00:00+08:00',
  updateTime: '2026-10-23T08:00:00+08:00'
}

const app = createApp({
  setup() {
    const calendar = shallowRef<InstanceType<typeof CalendarDayTypeDialogComponent>>()
    const hiddenTask = shallowRef<InstanceType<typeof HiddenHazardTaskActionDialogComponent>>()
    onMounted(async () => {
      await nextTick()
      if (feature === 'hidden-task')
        await hiddenTask.value?.handleOpen({ row: task, mode: 'transfer' })
      else
        await calendar.value?.handleOpen({
          departmentId: 'department-test',
          workDate: '2026-10-23',
          dayType: 'work_day'
        })
    })
    return () =>
      feature === 'hidden-task'
        ? h(HiddenHazardTaskActionDialog, { ref: hiddenTask })
        : h(CalendarDayTypeDialog, { ref: calendar })
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'entity-summary-context-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
app.mount('#entity-summary-context')
