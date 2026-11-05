import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import DashboardCertificateRisks from '@/views/dashboard/console/modules/dashboard-certificate-risks.vue'
import WorkflowTemplateLibraryDialog from '@/views/workflow/definition/modules/workflow-template-library-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const user = useUserStore(store)
const fixtureMode = new URLSearchParams(location.search).get('mode')
const certificateTypeLabel =
  fixtureMode === 'long' ? '审车年检与车辆技术状态联合检验项目（字典长文案）' : '审车年检（字典）'
const categoryLabel =
  fixtureMode === 'long' ? '财务审批与跨组织资金协同流程（字典长文案）' : '财务审批（字典）'
const categoryItems: Api.DataCenter.DictListItem[] = [
  {
    name: '流程模板类别',
    code: 'finance',
    value: 'finance',
    label: categoryLabel,
    status: '1'
  },
  { name: '流程模板类别', code: 'hr', value: 'hr', label: '人力资源（字典）', status: '1' }
]
user.setDictMap({
  vehicleCertificateType: [
    {
      name: '车辆证件类型',
      code: 'annual_inspection',
      value: 'annual_inspection',
      label: certificateTypeLabel,
      status: '1'
    }
  ],
  workflowTemplateCategory:
    fixtureMode === 'empty' || fixtureMode === 'loading' ? [] : categoryItems
})
if (fixtureMode === 'loading') {
  Object.assign(window, {
    releaseDictionaryFixture: () => {
      user.setDictMap({ ...user.getDictMap, workflowTemplateCategory: categoryItems })
    }
  })
}

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: {} }]
})
const app = createApp({
  setup() {
    const library = ref<InstanceType<typeof WorkflowTemplateLibraryDialog>>()
    return () =>
      h('main', { class: 'p-6' }, [
        h(DashboardCertificateRisks, {
          loading: false,
          error: null,
          expired: 0,
          dueSoon: 1,
          records: [
            {
              id: 'test-certificate',
              subjectType: 'vehicle',
              subjectId: 'test-vehicle',
              subjectLabel: '测试车辆',
              certificateType: 'annual_inspection',
              expiresOn: '2026-12-01',
              responsibleName: '测试责任人',
              status: 'due_30'
            }
          ]
        }),
        h(
          'button',
          { type: 'button', onClick: () => library.value?.handleOpen() },
          '打开流程模板库'
        ),
        h(WorkflowTemplateLibraryDialog, { ref: library })
      ])
  }
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
await router.push('/')
await router.isReady()
app.mount('#dictionary-business-display-preview')
