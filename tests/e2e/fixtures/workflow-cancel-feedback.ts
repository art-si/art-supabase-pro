import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import WorkflowCancelDialog from '@/views/workflow/monitor/modules/workflow-cancel-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const instance: Api.Workflow.WorkflowMonitorRecord = {
  id: '00000000-0000-0000-0000-000000000001',
  definitionId: '00000000-0000-0000-0000-000000000002',
  versionId: '00000000-0000-0000-0000-000000000003',
  businessType: 'test_document',
  businessId: '00000000-0000-0000-0000-000000000004',
  businessTitle: '测试审批单 TEST-001',
  initiatorUserId: '00000000-0000-0000-0000-000000000005',
  initiatorNameSnapshot: '测试用户',
  status: 'running',
  contextSnapshot: {},
  rowVersion: 1,
  startedAt: '2026-10-01T00:00:00.000Z',
  createTime: '2026-10-01T00:00:00.000Z',
  definitionName: '测试审批流程',
  definitionCode: 'TEST',
  versionNo: 1,
  pendingTaskCount: 1,
  isOverdue: false,
  durationHours: 1
}

const Preview = defineComponent({
  setup() {
    const dialog = ref<{ handleOpen: (row: Api.Workflow.WorkflowMonitorRecord) => Promise<void> }>()
    return () =>
      h('main', { class: 'p-6' }, [
        h(
          'button',
          {
            type: 'button',
            onClick: () => dialog.value?.handleOpen(instance)
          },
          '打开终止审批弹窗'
        ),
        h(WorkflowCancelDialog, { ref: dialog })
      ])
  }
})

const app = createApp(Preview)
app.use(store)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
app.use(language)
setupGlobDirectives(app)
app.mount('#workflow-cancel-preview')
