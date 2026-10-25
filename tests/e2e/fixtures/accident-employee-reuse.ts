import { createApp, h, ref, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import type { SmisAccidentPerson, SmisAccidentPreventionMeasure } from '@smis/api'
import AccidentMeasuresEditor from '@smis/views/safety-production/safety-accident/accident-flash-report/modules/accident-measures-editor.vue'
import AccidentPeopleEditor from '@smis/views/safety-production/safety-accident/accident-flash-report/modules/accident-people-editor.vue'
import AccidentAnalysisDialog from '@smis/views/safety-production/safety-accident/accident-investigation/modules/accident-analysis-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({
  setup() {
    const people = ref<SmisAccidentPerson[]>([])
    const measures = ref<SmisAccidentPreventionMeasure[]>([])
    const analysis = shallowRef<InstanceType<typeof AccidentAnalysisDialog>>()
    return () =>
      h('main', { class: 'p-4 space-y-4' }, [
        h(AccidentPeopleEditor, {
          modelValue: people.value,
          'onUpdate:modelValue': (value: SmisAccidentPerson[]) => (people.value = value)
        }),
        h(
          'output',
          { 'data-testid': 'people-snapshot', class: 'sr-only' },
          JSON.stringify(people.value)
        ),
        h('button', { onClick: () => analysis.value?.handleOpen({}) }, '打开事故分析'),
        h(AccidentAnalysisDialog, { ref: analysis }),
        h(AccidentMeasuresEditor, {
          modelValue: measures.value,
          'onUpdate:modelValue': (value: SmisAccidentPreventionMeasure[]) =>
            (measures.value = value)
        }),
        h(
          'output',
          { 'data-testid': 'measures-snapshot', class: 'sr-only' },
          JSON.stringify(measures.value)
        )
      ])
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'accident-reuse-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
app.mount('#accident-employee-reuse')
