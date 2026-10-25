import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import i18n from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import { ElInputNumber } from 'element-plus'
import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'

const items: FormItem[] = [
  { key: 'name', label: '普通输入', type: 'input', props: { disabled: false } },
  { key: 'enabled', label: '普通开关', type: 'switch', props: { disabled: false } },
  { key: 'count', label: '普通数字', type: 'number', props: { disabled: false } },
  {
    key: 'choice',
    label: '普通选择',
    type: 'select',
    props: { disabled: false },
    options: [{ label: '选项一', value: 'first' }]
  },
  { key: 'fixed', label: '字段只读', type: 'input', props: { disabled: true } },
  {
    key: 'checks',
    label: '普通复选组',
    type: 'checkboxGroup',
    props: { disabled: false },
    options: [{ label: '复选项', value: 'one', disabled: false }]
  },
  {
    key: 'radio',
    label: '普通单选组',
    type: 'radioGroup',
    props: { disabled: false },
    options: [{ label: '单选项', value: 'one', disabled: false }]
  },
  {
    key: 'fixedChecks',
    label: '只读复选组',
    type: 'checkboxGroup',
    props: { disabled: true },
    options: [{ label: '锁定复选项', value: 'one', disabled: false }]
  }
]
const app = createApp({
  setup() {
    const disabled = ref(true)
    const model = ref<Record<string, unknown>>({
      name: '初始名称',
      enabled: true,
      count: 1,
      choice: 'first',
      fixed: '只读值',
      checks: ['one'],
      radio: 'one',
      fixedChecks: ['one']
    })
    const submits = ref(0)
    return () =>
      h('main', { style: { padding: '16px' } }, [
        h('button', { onClick: () => (disabled.value = !disabled.value) }, '切换表单禁用'),
        h(ElInputNumber, { disabled: disabled.value, modelValue: 2, ariaLabel: '原生数字' }),
        h(ArtForm, {
          disabled: disabled.value,
          modelValue: model.value,
          items,
          span: 24,
          submitText: '提交验收',
          resetText: '重置验收',
          'onUpdate:modelValue': (value: Record<string, unknown>) => (model.value = value),
          onSubmit: () => submits.value++
        }),
        h('output', { 'aria-label': '提交次数' }, String(submits.value))
      ])
  }
})
app.use(store)
app.use(i18n)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => h('div') } }]
  })
)
setupGlobDirectives(app)
app.mount('#app')
