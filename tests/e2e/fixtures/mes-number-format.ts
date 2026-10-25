import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import Board from '@mes/views/production-plan/gantt-scheduling/modules/gantt-schedule-board.vue'
import type { MesOperationTask, MesProductionScopeCenter } from '@mes/api'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const center: MesProductionScopeCenter = {
  id: 'center',
  tenantId: 'test-tenant',
  departmentId: 'department',
  code: 'WC-001',
  name: '格式验证机台',
  sort: 0,
  headcount: 1,
  dailyCapacityMinutes: 480,
  efficiencyPercent: 100,
  utilizationPercent: 100,
  parallelCapacity: 1
}
const task: MesOperationTask = {
  id: 'task',
  tenantId: 'test-tenant',
  taskNo: 'TASK-001',
  workOrderId: 'order',
  routeStepId: null,
  sequenceNo: 1,
  sequenceType: 'main',
  operationCode: 'OP-001',
  operationName: '精度验证工序',
  controlCodeId: null,
  controlCodeSnapshot: '',
  controlCodeNameSnapshot: '',
  plannedQuantity: 1234.567,
  operationUnit: '件',
  scheduledQuantity: 0,
  pendingScheduleQuantity: 1234.567,
  completedQuantity: 0,
  cumulativeCompletedQuantity: 0,
  qualifiedQuantity: 0,
  cumulativeQualifiedQuantity: 0,
  unqualifiedQuantity: 0,
  cumulativeUnqualifiedQuantity: 0,
  scrapQuantity: 0,
  cumulativeScrapQuantity: 0,
  pendingReworkQuantity: 0,
  pendingInspectionQuantity: 0,
  plannedStartDate: null,
  plannedEndDate: null,
  requiredCompletionDate: null,
  requiredStartDate: null,
  departmentId: 'department',
  workCenterId: 'center',
  eligibleWorkCenterIds: ['center'],
  setupMinutes: 0,
  processingMinutes: 0,
  queueMinutes: 0,
  transferMinutes: 0,
  estimatedWorkMinutes: 60,
  minimumTransferQuantity: 0,
  overlapEnabled: false,
  scheduleLocked: false,
  scheduleSource: 'manual',
  schedulingRuleId: null,
  scheduledAt: null,
  scheduleVersion: 0,
  status: 'unscheduled',
  schedulingStatus: 'pending',
  operationStatus: 'planned',
  urgency: 'normal',
  reportedGoodQuantity: 0,
  reportedBadQuantity: 0,
  processContent: null,
  remark: '',
  annotation: '',
  barcodeValue: '',
  qrCodeValue: '',
  createTime: '2026-10-09',
  closedAt: null,
  deletedAt: null,
  updateTime: '2026-10-09',
  allocations: []
}
const shift = {
  key: '2026-10-09:1',
  workDate: '2026-10-09',
  index: 1,
  name: '白班',
  startTime: '08:00',
  endTime: '16:00',
  workMinutes: 480
}
const app = createApp({
  render: () =>
    h(
      'main',
      { class: 'p-4' },
      h(
        'div',
        { class: 'overflow-x-auto', 'data-testid': 'board-scroll' },
        h(Board, {
          groups: [{ center, tasks: [task] }],
          dates: [
            {
              date: '2026-10-09',
              label: '10月9日',
              weekday: '周五',
              isToday: true,
              isWeekend: false,
              shifts: [shift]
            }
          ],
          calendarDays: [
            {
              departmentId: 'department',
              workDate: '2026-10-09',
              patternId: 'pattern',
              patternName: '白班',
              shifts: [shift]
            }
          ],
          showQuantities: true,
          canSchedule: false,
          canAutoSchedule: false
        })
      )
    )
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
app.mount('#board')
