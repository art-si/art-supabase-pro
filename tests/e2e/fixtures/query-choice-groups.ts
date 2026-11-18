import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import ArtSearchBar, { type SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme } from '@/hooks/core/useTheme'
import language from '@/locales'
import { store } from '@/store'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const options = [
  { label: '按单据汇总', value: 'documents' },
  { label: '按单据明细', value: 'lines' },
  { label: '按业务部门', value: 'department' }
]
const items: SearchFormItem[] = [
  { key: 'view', label: '展示方式', type: 'segment', options, props: { block: true } },
  { key: 'scope', label: '展示范围', type: 'checkboxGroup', options }
]
const model = ref<Record<string, unknown>>({ view: 'documents', scope: ['documents'] })
const submitted = ref('')

const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view p-4', style: { width: 'min(100%, 560px)' } }, [
      h(ArtSearchBar, {
        modelValue: model.value,
        'onUpdate:modelValue': (value) => (model.value = value),
        items,
        span: 6,
        labelWidth: 96,
        showExpand: false,
        onSearch: (value) => (submitted.value = JSON.stringify(value))
      }),
      h('output', { 'aria-label': '已提交筛选' }, submitted.value)
    ])
})

app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'query-choice-groups', component: {} }]
  })
)
setupGlobDirectives(app)
initializeTheme()
app.mount('#query-choice-groups')
