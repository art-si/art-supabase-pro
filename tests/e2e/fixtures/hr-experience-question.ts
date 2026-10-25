import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import ExperienceQuestionDialog from '@hr/views/operations/employee-experience/modules/experience-question-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const survey: Api.Hr.EmployeeExperienceSurvey = {
  id: '00000000-0000-0000-0000-000000000001',
  tenantId: '00000000-0000-0000-0000-000000000002',
  surveyCode: 'TEST-001',
  surveyName: '匿名体验调查',
  surveyType: 'pulse',
  cadence: 'once',
  audienceType: 'all_active',
  minimumGroupSize: 5,
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  status: 'draft'
}

const Preview = defineComponent({
  setup() {
    const dialog = ref<{ handleOpen: (source: Api.Hr.EmployeeExperienceSurvey) => Promise<void> }>()
    return () =>
      h('main', { class: 'p-6' }, [
        h(
          'button',
          {
            type: 'button',
            onClick: () => dialog.value?.handleOpen(survey)
          },
          '打开题目弹窗'
        ),
        h(ExperienceQuestionDialog, { ref: dialog })
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
app.mount('#hr-experience-question-preview')
