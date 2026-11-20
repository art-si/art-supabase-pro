import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
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
  createTime: '2026-01-01',
  instance: {
    id: 'instance-a',
    definitionId: 'definition-a',
    versionId: 'version-a',
    businessType: 'purchase_request',
    businessId: 'purchase-request-a',
    businessTitle: '华东物流园区仓储设备年度维护与安全升级采购申请 CGSQ-2026-1108-017',
    initiatorUserId: 'initiator-user',
    initiatorNameSnapshot: '采购申请人',
    status: 'running',
    contextSnapshot: {},
    rowVersion: 1,
    startedAt: '2026-01-01',
    createTime: '2026-01-01'
  }
}
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
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
    )
})
app.use(store)
app.use(router)
app.use(language)
initializeTheme()
document.documentElement.dataset.uiScope = 'workspace'
document.documentElement.dataset.boxMode = useSettingStore(store).boxBorderMode
  ? 'border-mode'
  : 'shadow-mode'
setupGlobDirectives(app)
await router.isReady()
app.mount('#workflow-transfer')
