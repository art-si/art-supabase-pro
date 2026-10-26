import { createApp, h, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
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
    window.addEventListener('hr-experience-set-scope', (event) => {
      tenantScope.setTenantScope((event as CustomEvent<string | null>).detail)
      userStore.setDictMap(testDictMap)
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
const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: 'hr-experience-options-user',
  tenantId: 'tenant-platform',
  platformSuper: true
})
const dictItem = (label: string, value: string, sort: number) => ({
  name: label,
  code: value,
  label,
  value,
  status: '1',
  sort
})
const testDictMap = {
  hrExperienceDimension: [dictItem('敬业度', 'engagement', 1)],
  hrExperienceSurveyType: [dictItem('脉搏调查', 'pulse', 1)],
  hrExperienceCadence: [dictItem('单次调查', 'one_time', 1)],
  hrExperienceAudienceType: [
    dictItem('全部在职员工', 'all_active', 1),
    dictItem('指定组织', 'organization', 2)
  ]
}
userStore.setDictMap(testDictMap)
const tenantScope = useTenantScopeStore(store)
tenantScope.scopeOwnerUserId = 'hr-experience-options-user'
tenantScope.tenantOptions = [
  { id: 'tenant-platform', tenantCode: 'PLATFORM', tenantName: '平台租户' },
  { id: 'tenant-a', tenantCode: 'A', tenantName: '甲租户' },
  { id: 'tenant-b', tenantCode: 'B', tenantName: '乙租户' }
]
tenantScope.setTenantScope(null)
app.mount('#hr-experience-options')
