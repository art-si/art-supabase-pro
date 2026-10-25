import { computed, createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const form = ref<InstanceType<typeof ArtForm>>()
const tenant = ref('a')
const model = ref({ member: '', reason: '' })
const manual = new URLSearchParams(location.search).has('manual')
const phase = new URLSearchParams(location.search).get('phase')
let callbackFailure = true
const validity = ref('未校验')
const submissions = ref(0)
const items = computed<FormItem[]>(() => [
  {
    key: 'member',
    label: '审批成员',
    type: 'select',
    resultField: 'data',
    params: { tenant: tenant.value },
    autoSelect: 'one',
    immediate: !manual,
    beforeFetch: (params) => {
      if (phase === 'before' && callbackFailure) throw new Error('synthetic before failure')
      return params
    },
    afterFetch: (result) => {
      if (phase === 'after' && callbackFailure) throw new Error('synthetic after failure')
      return result
    },
    api: async (params) => {
      const response = await fetch(`/form-options-test?tenant=${params?.tenant}`)
      return response.json()
    }
  },
  { key: 'reason', label: '原因', type: 'input' }
])
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
const app = createApp({
  render: () =>
    h('main', [
      h(
        'button',
        {
          onClick: () => {
            tenant.value = 'b'
          }
        },
        '切换租户'
      ),
      h('button', { onClick: () => form.value?.reloadOptions('member') }, '刷新选项'),
      h(
        'button',
        {
          disabled: !form.value?.readyToSubmit,
          onClick: async () => {
            if (await form.value?.validate(() => undefined)) submissions.value += 1
          }
        },
        '外部保存'
      ),
      h(
        'button',
        {
          onClick: () => {
            callbackFailure = false
          }
        },
        '允许加载'
      ),
      h(
        'button',
        {
          onClick: async () => {
            validity.value = String(await form.value?.validate(() => undefined))
          }
        },
        '校验表单'
      ),
      h(
        'button',
        {
          onClick: async () => {
            try {
              await form.value?.validate()
              validity.value = '校验通过'
            } catch {
              validity.value = '已阻止'
            }
          }
        },
        '无回调校验'
      ),
      h(ArtForm, {
        ref: form,
        modelValue: model.value,
        'onUpdate:modelValue': (value) => Object.assign(model.value, value),
        items: items.value,
        showSubmit: true,
        submitText: '提交表单',
        onSubmit: () => {
          submissions.value += 1
        },
        showReset: false
      }),
      h('output', { 'data-testid': 'member' }, model.value.member),
      h('output', { 'data-testid': 'validity' }, validity.value),
      h('output', { 'data-testid': 'submissions' }, String(submissions.value))
    ])
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.isReady()
app.mount('#form-options')
