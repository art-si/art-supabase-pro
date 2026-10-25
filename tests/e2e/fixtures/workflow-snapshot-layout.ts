import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import ActionDialog from '@/views/workflow/workbench/modules/workflow-action-dialog.vue'
import Snapshot from '@/views/workflow/modules/workflow-business-snapshot.vue'
import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
document.documentElement.dataset.boxMode = params.get('box') ?? 'border-mode'
const snapshot: Api.Workflow.WorkflowBusinessSnapshot = {
  instanceId: 'instance-a',
  businessId: 'contract-a',
  businessType: 'scm_sales_contract',
  title: '销售合同 TEST-001',
  businessNo: 'TEST-001',
  routePath: '/source',
  fields: [
    { label: '项目', value: '测试项目' },
    { label: '客户', value: '测试客户名称'.repeat(12) },
    { label: '合同编号', value: 'TEST-001' },
    { label: '合同金额', value: '65948.4' },
    { label: '说明', value: '较长审批资料'.repeat(30) }
  ],
  metrics: [],
  warnings: [],
  attachments: []
}
const task: Api.Workflow.WorkflowTaskRecord = {
  id: 'task-a',
  instanceId: 'instance-a',
  nodeKey: 'review',
  nodeName: '销售合同审批',
  nodeOrder: 1,
  approvalMode: 'any',
  approvalThresholdPercent: 100,
  rejectVetoEnabled: true,
  assigneeUserId: 'user-a',
  assigneeNameSnapshot: '测试审批员',
  originalAssigneeUserId: 'user-a',
  originalAssigneeNameSnapshot: '测试审批员',
  assignmentSource: 'direct',
  tenantId: 'tenant-a',
  status: 'pending',
  createTime: '2026-01-01'
}
const dialog = ref<InstanceType<typeof ActionDialog>>()
const drawer = ref<ArtDrawerExpose>()
const state = ref<'content' | 'loading' | 'empty' | 'error'>('content')
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
const app = createApp({
  render: () =>
    h('main', { style: { padding: '16px' } }, [
      ...(['approve', 'reject'] as const).map((action) =>
        h(
          'button',
          { onClick: () => dialog.value?.handleOpen(task, action) },
          action === 'approve' ? '打开通过' : '打开驳回'
        )
      ),
      h(
        'button',
        {
          onClick: () =>
            drawer.value?.handleOpen(undefined, { title: '审批实例详情', showFooter: false })
        },
        '打开详情'
      ),
      ...(['content', 'loading', 'empty', 'error'] as const).map((value) =>
        h(
          'button',
          {
            onClick: () => {
              state.value = value
            }
          },
          value
        )
      ),
      h(
        'div',
        { style: { display: 'grid', gap: '16px', marginTop: '16px' }, 'data-testid': 'cards' },
        [
          h(Snapshot, { snapshot }),
          h(
            ArtSectionCard,
            {
              title: '其他页面的自适应卡片',
              loading: state.value === 'loading',
              empty: state.value === 'empty',
              error: state.value === 'error' ? '测试失败，请重试' : null,
              onRetry: () => {
                state.value = 'content'
              }
            },
            () =>
              h(
                'div',
                { style: { height: '240px' }, 'data-testid': 'generic-content' },
                '公共卡片内容'
              )
          ),
          h(ArtSectionCard, { title: '固定高度滚动卡片', style: { height: '240px' } }, () =>
            h(
              'div',
              { style: { height: '600px', flexShrink: 0 }, 'data-testid': 'bounded-content' },
              '应在卡片内滚动'
            )
          ),
          h('p', { 'data-testid': 'following' }, '后续内容不得被卡片覆盖')
        ]
      ),
      h(ActionDialog, { ref: dialog }),
      h(ArtDrawer, { ref: drawer, size: 'xl', showFooter: false }, () =>
        h('div', { style: { display: 'grid', gap: '16px' } }, [
          h(Snapshot, { snapshot }),
          h(ArtSectionCard, { title: '实例概览' }, () => '后续实例资料')
        ])
      )
    ])
})
app.use(store).use(router).use(language)
setupGlobDirectives(app)
await router.isReady()
app.mount('#app')
