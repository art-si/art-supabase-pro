import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import TransferDialog from '@/views/workflow/workbench/modules/workflow-transfer-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const dialog = ref<InstanceType<typeof TransferDialog>>()
const successes = ref(0)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
const task: Api.Workflow.WorkflowTaskRecord = {
  id: 'task-a',
  instanceId: 'instance-a',
  nodeKey: 'review',
  nodeName: '审核',
  nodeOrder: 1,
  approvalMode: 'all',
  approvalThresholdPercent: 100,
  rejectVetoEnabled: false,
  assigneeUserId: 'current-user',
  assigneeNameSnapshot: '当前审核员',
  originalAssigneeUserId: 'current-user',
  originalAssigneeNameSnapshot: '当前审核员',
  assignmentSource: 'direct',
  tenantId: 'tenant-a',
  status: 'pending',
  createTime: '2026-01-01'
}
const app = createApp({
  render: () =>
    h('main', [
      h('button', { onClick: () => dialog.value?.handleOpen(task) }, '打开转交'),
      h(
        'button',
        {
          onClick: () => dialog.value?.handleOpen({ ...task, id: 'task-b', tenantId: 'tenant-b' })
        },
        '打开另一租户任务'
      ),
      h(TransferDialog, {
        ref: dialog,
        onSuccess: () => {
          successes.value += 1
        }
      }),
      h('output', { 'data-testid': 'success-count' }, String(successes.value))
    ])
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.isReady()
app.mount('#workflow-transfer')
