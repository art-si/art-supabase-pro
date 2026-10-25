import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import type { CenterPolicy, WorkCenterActivityInput } from '@mdm/api'
import ActivityEditor from '@mdm/views/production/work-center/modules/activity-editor.vue'
import PolicyEditor from '@mdm/views/production/work-center/modules/policy-editor.vue'
import { createCenterPolicy } from '@mdm/views/production/work-center/modules/center-policy'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({
  setup() {
    const activities = ref<WorkCenterActivityInput[]>([])
    if (new URLSearchParams(location.search).get('mode') === 'activity') {
      return () =>
        h('main', { class: 'p-4' }, [
          h(ActivityEditor, {
            modelValue: activities.value,
            'onUpdate:modelValue': (value: WorkCenterActivityInput[]) => {
              activities.value = value
            },
            formulas: []
          })
        ])
    }
    const policy = ref(createCenterPolicy())
    const section = ref('报工规则')
    return () =>
      h('main', { class: 'p-4' }, [
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              section.value = '自动化'
            }
          },
          '切换自动化'
        ),
        h(PolicyEditor, {
          modelValue: policy.value,
          'onUpdate:modelValue': (value: CenterPolicy) => {
            policy.value = value
          },
          section: section.value
        })
      ])
  }
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
await router.isReady()
app.mount('#app')
