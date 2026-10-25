import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { setupGlobDirectives } from '@/directives'
import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const model = ref({
  name: '初始名称',
  period: [new Date('2026-10-03T00:00:00Z'), new Date('2026-10-04T00:00:00Z')],
  attachment: new File(['测试附件内容'], 'test.txt', { type: 'text/plain' }),
  blank: '',
  count: 0,
  enabled: false
})
const output = ref('尚未提交')
const formRef = ref<InstanceType<typeof ArtForm>>()
const validation = ref('尚未校验')
const params = new URLSearchParams(location.search)
const customLayout = ref(params.get('layout') === 'custom')
document.documentElement.dataset.boxMode = params.get('box') ?? 'border-mode'
const validateForm = async (callback: boolean): Promise<void> => {
  try {
    if (callback) {
      await formRef.value?.validate((valid, fields) => {
        validation.value = valid
          ? '校验通过'
          : `校验未通过：${Object.keys(fields ?? {}).join('、')}`
      })
    } else {
      validation.value = (await formRef.value?.validate()) ? '校验通过' : '校验未通过'
    }
  } catch {
    validation.value = '校验未通过'
  }
}
const items: FormItem[] = [
  { key: 'name', label: '名称', type: 'input' },
  { key: 'period', label: '日期范围', type: 'daterange' }
]
const app = createApp({
  setup() {
    const setting = useSettingStore()
    const theme = params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
    setting.setGlobalTheme(theme, theme)
    setting.boxBorderMode = params.get('box') !== 'shadow-mode'
    initializeTheme()
    return () =>
      h('main', { class: 'p-4' }, [
        h('h1', { class: 'text-xl' }, '表单控件值验收'),
        h(
          'button',
          { onClick: () => (customLayout.value = !customLayout.value) },
          '切换自定义布局'
        ),
        h('button', { onClick: () => validateForm(false) }, '外部校验'),
        h('button', { onClick: () => validateForm(true) }, '回调校验'),
        h('output', { 'aria-label': '校验结果' }, validation.value),
        h(
          ArtForm,
          {
            ref: formRef,
            customLayout: customLayout.value,
            modelValue: model.value,
            items,
            span: 24,
            submitText: '提交测试',
            resetText: '重置测试',
            sanitizeOutput: { removeEmptyString: true },
            onSubmit: async (value: Record<string, unknown>) => {
              output.value = JSON.stringify({
                name: value.name,
                period: Array.isArray(value.period)
                  ? value.period.map((date: unknown) =>
                      date instanceof Date ? date.toISOString() : null
                    )
                  : null,
                attachment:
                  value.attachment instanceof File
                    ? { name: value.attachment.name, content: await value.attachment.text() }
                    : null,
                hasBlank: Object.hasOwn(value, 'blank'),
                count: value.count,
                enabled: value.enabled
              })
            }
          },
          { default: () => h('p', { 'data-testid': 'custom-layout-content' }, '自定义表单内容') }
        ),
        h('output', { 'data-testid': 'form-output' }, output.value)
      ])
  }
})
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
setupGlobDirectives(app)
app.mount('#form-values-preview')
