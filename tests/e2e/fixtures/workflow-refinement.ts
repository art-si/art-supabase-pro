import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const mode = params.get('mode')
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
document.documentElement.dataset.boxMode = params.get('box') || 'border-mode'
useUserStore(store).setUserInfo({
  userId: 'reviewer-a',
  tenantId: 'tenant-a',
  platformSuper: true
})
const baseTask: Api.Workflow.WorkflowTaskRecord = {
  id: 'task-a',
  instanceId: 'instance-a',
  nodeKey: 'review',
  nodeName: '部门审批',
  nodeOrder: 1,
  approvalMode: 'percentage',
  approvalThresholdPercent: 60,
  rejectVetoEnabled: false,
  assigneeUserId: 'reviewer-a',
  assigneeNameSnapshot: '测试审批人',
  originalAssigneeUserId: 'reviewer-a',
  originalAssigneeNameSnapshot: '测试审批人',
  assignmentSource: 'direct',
  tenantId: 'tenant-a',
  status: 'pending',
  createTime: '2026-11-01T09:00:00+08:00'
}
const tasks = ref<Api.Workflow.WorkflowTaskRecord[]>([
  ...Array.from({ length: 7 }, (_, index) => ({
    ...baseTask,
    id: `finished-${index}`,
    status: index === 0 ? ('rejected' as const) : ('approved' as const),
    assigneeNameSnapshot: `历史审批人 ${index + 1}`,
    handledAt: '2026-11-01T10:00:00+08:00'
  })),
  { ...baseTask, id: 'current-reviewer', assigneeNameSnapshot: '当前待处理人' }
])
const snapshot: Api.Workflow.WorkflowBusinessSnapshot = {
  instanceId: 'instance-a',
  businessId: 'business-a',
  businessType: 'scm_sales_contract',
  title: '审批业务 TEST-001',
  fields: [],
  metrics: [],
  warnings: [],
  attachments: []
}
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
let renderContent: () => ReturnType<typeof h>
if (mode === 'drawer') {
  const { default: Drawer } =
    await import('@/views/workflow/workbench/modules/workflow-instance-drawer.vue')
  const drawer = ref<InstanceType<typeof Drawer>>()
  renderContent = () =>
    h('main', { class: 'p-4' }, [
      h('button', { onClick: () => void drawer.value?.handleOpen('instance-a') }, '打开实例 A'),
      h('button', { onClick: () => void drawer.value?.handleOpen('instance-b') }, '打开实例 B'),
      h(Drawer, { ref: drawer })
    ])
} else {
  const { default: Board } = await import('@/views/workflow/modules/workflow-task-board.vue')
  const { default: Snapshot } =
    await import('@/views/workflow/modules/workflow-business-snapshot.vue')
  renderContent = () =>
    h('main', { class: 'grid min-w-0 gap-4 p-4' }, [
      h(
        'button',
        {
          onClick: () => {
            tasks.value = tasks.value.filter((task) => task.status !== 'pending')
          }
        },
        '模拟全部任务结束'
      ),
      h(Board, { tasks: tasks.value }),
      h(Snapshot, { snapshot })
    ])
}
const app = createApp({ render: renderContent })
app.use(store).use(language).use(router)
setupGlobDirectives(app)
await router.isReady()
app.mount('#workflow-refinement')
