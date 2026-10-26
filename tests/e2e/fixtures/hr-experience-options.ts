import { createApp, h, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import ExperienceActionDialog from '../../../modules/art-supabase-hr/src/views/operations/employee-experience/modules/experience-action-dialog.vue'
import ExperienceSurveyDialog from '../../../modules/art-supabase-hr/src/views/operations/employee-experience/modules/experience-survey-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({
  setup() {
    const actionDialog = shallowRef<InstanceType<typeof ExperienceActionDialog>>()
    const surveyDialog = shallowRef<InstanceType<typeof ExperienceSurveyDialog>>()

    window.addEventListener('hr-experience-open-action', (event) => {
      const tenantId = (event as CustomEvent<string | undefined>).detail
      void actionDialog.value?.handleOpen({
        type: 'add',
        ...(tenantId
          ? {
              presetSurvey: {
                id: `survey-${tenantId}`,
                tenantId,
                surveyCode: `SURVEY-${tenantId}`,
                surveyName: `${tenantId} 调查`
              }
            }
          : {})
      })
    })
    window.addEventListener('hr-experience-open-survey', () => {
      void surveyDialog.value?.handleOpen('add')
    })

    return () =>
      h('main', { class: 'art-page-view min-h-screen p-4' }, [
        h(ExperienceActionDialog, { ref: actionDialog }),
        h(ExperienceSurveyDialog, { ref: surveyDialog })
      ])
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'hr-experience-options-user',
  tenantId: 'tenant-platform',
  platformSuper: true
})
app.mount('#hr-experience-options')
