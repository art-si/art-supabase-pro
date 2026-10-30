import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import { SystemThemeEnum } from '@/enums/app-enum'
import { initializeTheme } from '@/hooks/core/useTheme'
import { setupGlobDirectives } from '@/directives'
import ArtProcessTimeline from '@/components/core/layouts/art-process-timeline/index.vue'
import WorkflowTaskBoard from '@/views/workflow/modules/workflow-task-board.vue'
import WorkflowFlowMap from '@/components/business/workflow-flow-map/index.vue'
import type { ArtProcessTimelineItem } from '@/components/core/layouts/art-process-timeline/types'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const names = ['张三', 'john.doe@example.test', '👩‍🔧 Smith', '🇨🇳李', '']
const timestamp = '2026-10-10T09:15:00+08:00'
const empty = ref(false)
const params = new URLSearchParams(location.search)
const grouping = params.has('grouping')
const compact = params.has('compact')
const items: ArtProcessTimelineItem[] = names.map((actorName, index) => ({
  id: String(index),
  actorName,
  actionLabel: '已记录',
  time: timestamp
}))
const tasks: Api.Workflow.WorkflowTaskRecord[] = names.map((assigneeNameSnapshot, index) => ({
  id: String(index),
  instanceId: 'fixture',
  nodeKey: 'fixture',
  nodeName: '审批头像验收',
  nodeOrder: 1,
  approvalMode: 'all',
  approvalThresholdPercent: 100,
  rejectVetoEnabled: true,
  assigneeUserId: String(index),
  assigneeNameSnapshot,
  originalAssigneeUserId: String(index),
  originalAssigneeNameSnapshot: assigneeNameSnapshot,
  assignmentSource: 'direct',
  tenantId: 'fixture',
  status: 'pending',
  createTime: timestamp
}))
const groupedTasks: Api.Workflow.WorkflowTaskRecord[] = (
  [
    ['10', '节点十', '十甲', 'approved'],
    ['2', '节点二', '二甲', 'approved'],
    ['10', '节点十', '十乙', 'pending'],
    ['__proto__', '特殊节点', '特殊审批人', 'rejected']
  ] as const
).map(([nodeKey, nodeName, name, status], index) => ({
  ...tasks[0],
  id: `grouped-${index}`,
  nodeKey,
  nodeName,
  assigneeUserId: `grouped-user-${index}`,
  assigneeNameSnapshot: name,
  status
}))
const nodes: Api.Workflow.WorkflowNode[] = [
  ['10', '节点十'],
  ['2', '节点二'],
  ['__proto__', '特殊节点'],
  ['constructor', '无任务节点']
].map(([key, name]) => ({
  key,
  name,
  order: 1,
  approvalMode: 'all',
  approvalThresholdPercent: 100,
  rejectVetoEnabled: true,
  allowSelfApproval: false,
  dueHours: 24,
  reminderBeforeMinutes: 60,
  escalationEnabled: false,
  escalateAfterHours: 4,
  assignee: { type: 'roles', roleCodes: [] },
  condition: { operator: 'always' }
}))
const app = createApp({
  render: () =>
    h('main', { class: 'grid gap-6 p-4' }, [
      h(
        'button',
        {
          type: 'button',
          class: 'justify-self-start',
          onClick: () => {
            empty.value = !empty.value
          }
        },
        empty.value ? '恢复记录' : '切换空状态'
      ),
      ...(grouping
        ? []
        : [h(ArtProcessTimeline, { items: empty.value ? [] : items, maxHeight: 'none' })]),
      h(WorkflowTaskBoard, { tasks: empty.value ? [] : grouping ? groupedTasks : tasks }),
      ...(grouping
        ? [
            h(WorkflowFlowMap, {
              nodes,
              tasks: empty.value ? [] : groupedTasks,
              instanceStatus: 'running',
              currentNodeKey: '10',
              compact
            })
          ]
        : [])
    ])
})
app.use(store)
if (grouping) {
  const setting = useSettingStore(store)
  const theme = params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
  setting.setGlobalTheme(theme, theme)
  setting.boxBorderMode = params.get('box') !== 'shadow'
  document.documentElement.setAttribute(
    'data-box-mode',
    setting.boxBorderMode ? 'border-mode' : 'shadow-mode'
  )
  document.documentElement.dataset.uiScope = 'workspace'
  initializeTheme()
}
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => h('div') } }]
  })
)
setupGlobDirectives(app)
app.mount('#avatar-reuse-preview')
