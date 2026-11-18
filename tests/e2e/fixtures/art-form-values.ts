import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { setupGlobDirectives } from '@/directives'
import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
import ArtSearchBar, { type SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const model = ref({
  name: '初始名称',
  period: [new Date('2026-10-03T00:00:00Z'), new Date('2026-10-04T00:00:00Z')],
  attachment: new File(['测试附件内容'], 'test.txt', { type: 'text/plain' }),
  blank: '',
  count: 0,
  enabled: false,
  acknowledged: false
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
  {
    key: 'name',
    label: '名称',
    type: 'input',
    formItemProps: params.has('field-state')
      ? {
          required: true,
          error: '外部字段校验提示',
          'data-validation-key': 'profile.name'
        }
      : undefined
  },
  { key: 'period', label: '日期范围', type: 'daterange' },
  { key: 'acknowledged', label: '业务确认', type: 'checkbox', props: { label: '确认业务值' } }
]
const queryRangeProps = {
  valueFormat: 'YYYY-MM-DD',
  rangeSeparator: '至',
  startPlaceholder: '开始日期',
  endPlaceholder: '结束日期'
}
const queryRangeItems: SearchFormItem[] = [
  { key: 'owner', label: '责任人', type: 'input' },
  { key: 'period', label: '创建日期', type: 'daterange', props: queryRangeProps },
  {
    key: 'inspection',
    label: '计划排查时间',
    type: 'date',
    span: 8,
    props: { ...queryRangeProps, type: 'daterange' }
  },
  { key: 'archive', label: '归档日期', type: 'daterange', span: 16, props: queryRangeProps }
]
const queryRangeValue = ref<Record<string, unknown>>({
  owner: '',
  period: [],
  inspection: ['2026-11-07', '2026-11-10'],
  archive: []
})
const queryTimeItems: SearchFormItem[] = [
  {
    key: 'timestamps',
    label: '计划时间',
    type: 'datetimerange',
    props: {
      valueFormat: 'YYYY-MM-DD HH:mm:ss',
      rangeSeparator: '至',
      startPlaceholder: '开始时间',
      endPlaceholder: '结束时间',
      clearable: true
    }
  },
  {
    key: 'months',
    label: '财年月份',
    type: 'date',
    props: {
      type: 'monthrange',
      valueFormat: 'YYYY-MM',
      rangeSeparator: '至',
      startPlaceholder: '开始月份',
      endPlaceholder: '结束月份'
    }
  }
]
const queryTimeValue = ref<Record<string, unknown>>({
  timestamps: ['2026-11-07 09:35:30', '2026-11-10 21:44:01'],
  months: ['2026-07', '2026-11']
})
const multiOptions = [
  { label: '华东跨区域仓储协调中心（一期）', value: 'east' },
  { label: '华南配送', value: 'south' },
  { label: '华北仓储', value: 'north' }
]
const queryMultiItems: SearchFormItem[] = [
  {
    key: 'areas',
    label: '负责区域',
    type: 'select',
    options: multiOptions,
    props: { multiple: true }
  },
  {
    key: 'groups',
    label: '组织分组',
    type: 'selectV2',
    options: multiOptions,
    props: { multiple: true, collapseTags: true, collapseTagsTooltip: true }
  },
  { key: 'keyword', label: '关键词', type: 'input' }
]
const queryMultiValue = ref<Record<string, unknown>>({
  areas: ['east', 'south', 'north'],
  groups: ['east', 'south', 'north'],
  keyword: ''
})
const retainedQueryItems: SearchFormItem[] = [
  ...queryRangeItems.slice(0, 3),
  { key: 'count', label: '有效次数', type: 'number' },
  { key: 'enabled', label: '启用', type: 'switch' },
  { key: 'literal', label: '匹配用语', type: 'input' },
  { key: 'range', label: '有效日期', type: 'daterange', props: queryRangeProps },
  { key: 'status', label: '状态', type: 'select', options: [{ label: '全部状态', value: 'all' }] },
  { key: 'whitespace', label: '空白', type: 'input' },
  { key: 'hiddenValue', label: '隐藏字段', type: 'input', hidden: true },
  { key: 'areas', label: '可选区域', type: 'select', props: { multiple: true } }
]
const retainedQueryValue = ref<Record<string, unknown>>({
  count: 0,
  enabled: false,
  literal: 'all',
  range: ['2026-11-07', '2026-11-10'],
  status: 'all',
  whitespace: '  ',
  hiddenValue: '不呈现',
  areas: []
})
const app = createApp({
  setup() {
    const setting = useSettingStore()
    const theme = params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
    setting.setGlobalTheme(theme, theme)
    setting.boxBorderMode = params.get('box') !== 'shadow-mode'
    initializeTheme()
    if (params.has('descriptions')) {
      const described = ref(true)
      const renderForm = (copy: string) => {
        const fields: FormItem[] = [
          {
            key: 'name',
            label: '说明输入',
            type: 'input',
            description: described.value ? `${copy}填写提示` : undefined,
            props: { 'aria-describedby': 'existing-field-instruction' }
          },
          {
            key: 'customInput',
            label: '',
            description: described.value ? `${copy}槽说明` : undefined
          },
          {
            key: 'choice',
            label: '确认方式',
            type: 'radioGroup',
            options: [{ label: '人工确认', value: 'manual' }],
            description: described.value ? `${copy}组说明` : undefined
          },
          {
            key: 'range',
            label: '填报日期',
            type: 'daterange',
            props: queryRangeProps,
            description: described.value ? `${copy}日期说明` : undefined
          }
        ]
        return h('section', { 'aria-label': `${copy}表单` }, [
          h(
            ArtForm,
            { items: fields, span: 24 },
            {
              customInput: ({ descriptionId }: { descriptionId?: string }) =>
                h('label', ['自定义输入', h('input', { 'aria-describedby': descriptionId })])
            }
          )
        ])
      }
      return () =>
        h('main', { class: 'p-4' }, [
          h('p', { id: 'existing-field-instruction' }, '外部填写规则'),
          h(
            'button',
            { type: 'button', onClick: () => (described.value = !described.value) },
            '切换字段说明'
          ),
          ...['甲', '乙'].map(renderForm)
        ])
    }
    const query = [
      ['query-range', queryRangeValue, queryRangeItems],
      ['query-range-time', queryTimeValue, queryTimeItems],
      ['query-multi', queryMultiValue, queryMultiItems],
      ['query-retained', retainedQueryValue, retainedQueryItems]
    ] as const
    const queryFixture = query.find(([mode]) => params.has(mode))
    if (queryFixture) {
      const [, queryValue, searchItems] = queryFixture
      return () =>
        h('main', { class: 'p-4', style: { width: 'min(100%, var(--query-test-width, 640px))' } }, [
          h(ArtSearchBar, {
            modelValue: queryValue.value,
            'onUpdate:modelValue': (value) => (queryValue.value = value),
            items: searchItems,
            labelWidth: 96,
            onSearch: (value) => (output.value = JSON.stringify(value))
          }),
          h('output', { 'data-testid': 'query-output', class: 'sr-only' }, output.value)
        ])
    }
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
            showReset: true,
            showSubmit: true,
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
                enabled: value.enabled,
                acknowledged: value.acknowledged
              })
            }
          },
          {
            default: () => h('p', { 'data-testid': 'custom-layout-content' }, '自定义表单内容'),
            footer: () =>
              params.has('field-state')
                ? h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => {
                        validation.value = '尾部操作已执行'
                      }
                    },
                    '配置式表单尾部操作'
                  )
                : null
          }
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
