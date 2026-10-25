import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import ArtProcessTimeline from '@/components/core/layouts/art-process-timeline/index.vue'
import WorkflowTaskBoard from '@/views/workflow/modules/workflow-task-board.vue'
import type { ArtProcessTimelineItem } from '@/components/core/layouts/art-process-timeline/types'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const names = ['张三', 'john.doe@example.test', '👩‍🔧 Smith', '🇨🇳李', '']
const timestamp = '2026-10-10T09:15:00+08:00'
const empty = ref(false)
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
      h(ArtProcessTimeline, { items: empty.value ? [] : items, maxHeight: 'none' }),
      h(WorkflowTaskBoard, { tasks: empty.value ? [] : tasks })
    ])
})
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => h('div') } }]
  })
)
setupGlobDirectives(app)
app.mount('#avatar-reuse-preview')
