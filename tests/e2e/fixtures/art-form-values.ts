import { cloneVNode, createApp, h, ref, shallowReactive, unref, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider, ElInput, type FormProps } from 'element-plus'
import language from '@/locales'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { setupGlobDirectives } from '@/directives'
import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
import ArtSearchBar, { type SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
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
    if (params.has('registry-units')) {
      document.documentElement.dataset.uiScope = 'workspace'
      const values = ref<Record<string, unknown>>({
        nativeName: '初始原生名称',
        tagStyle: 'primary',
        dynamicValue: '保留的动态字段值'
      })
      const showTagStyle = ref(false)
      const showDynamic = ref(false)
      // Mutate the same metadata object to exercise captured field/unit lifecycle callbacks.
      const dynamicItem = shallowReactive<FormItem>({
        key: 'dynamicValue',
        label: '动态单位字段',
        type: 'cascader',
        hidden: () => !showDynamic.value,
        options: [{ label: '一号库位', value: '保留的动态字段值' }]
      })
      const fields: FormItem[] = [
        { key: 'nativeName', label: '原生名称', type: 'input' },
        {
          key: 'tagStyle',
          label: '标签样式',
          type: 'tagStyleSelect',
          hidden: () => !showTagStyle.value
        },
        dynamicItem
      ]
      const rules = {
        nativeName: [{ required: true, message: '请填写原生名称' }],
        dynamicValue: [{ required: true, message: '请填写动态字段' }]
      }
      const form = ref<InstanceType<typeof ArtForm>>()
      const validation = ref('尚未校验')
      const submissions = ref(0)
      const submitted = ref('尚未提交')
      let validationSequence = 0
      const validate = async () => {
        if (!form.value) throw new Error('动态单位表单尚未挂载')
        let valid = false
        let keys: string[] = []
        try {
          await form.value.validate((result, fields) => {
            valid = result
            keys = Object.keys(fields ?? {})
          })
        } catch (error) {
          keys = typeof error === 'object' && error !== null ? Object.keys(error) : []
        }
        validation.value = JSON.stringify({ sequence: ++validationSequence, valid, keys })
      }
      const button = (label: string, action: () => void) =>
        h('button', { type: 'button', onClick: action }, label)
      return () =>
        h('main', { class: 'min-w-0 space-y-3 p-4' }, [
          h('h1', { class: 'text-xl' }, '动态控件加载单位'),
          h('nav', { class: 'flex flex-wrap gap-3', 'aria-label': '加载单位切换' }, [
            button('显示标签控件', () => (showTagStyle.value = true)),
            button('显示级联控件', () => (showDynamic.value = true)),
            button('切换动态字段为原生', () => (dynamicItem.type = 'constructor')),
            button('切回级联控件', () => (dynamicItem.type = 'cascader')),
            button('单位回调校验', () => void validate())
          ]),
          h(ArtForm, {
            ref: form,
            modelValue: values.value,
            'onUpdate:modelValue': (value) => (values.value = value),
            items: fields,
            span: 24,
            showSubmit: true,
            showReset: false,
            submitText: '单位提交',
            rules,
            onSubmit: (value: Record<string, unknown>) => {
              submitted.value = JSON.stringify(value)
              submissions.value++
            }
          }),
          h(
            'output',
            { 'data-testid': 'units-ready', hidden: true },
            String(unref(form.value?.controlsReady))
          ),
          h('output', { 'data-testid': 'units-validation', hidden: true }, validation.value),
          h(
            'output',
            { 'data-testid': 'units-values', hidden: true },
            JSON.stringify(values.value)
          ),
          h(
            'output',
            { 'data-testid': 'units-submissions', hidden: true },
            String(submissions.value)
          ),
          h('output', { 'data-testid': 'units-output', hidden: true }, submitted.value),
          h('output', { 'data-testid': 'units-kind', hidden: true }, dynamicItem.type)
        ])
    }
    if (params.has('placeholder-native')) {
      document.documentElement.dataset.uiScope = 'workspace'
      const requestedSize = params.get('size')
      const size =
        requestedSize === 'small' || requestedSize === 'large' ? requestedSize : 'default'
      const emptySize = params.has('size-empty')
      const inheritSize = params.has('size-provider') && !emptySize
      const ownSmallSize = size === 'large' ? { size: 'small' } : {}
      const values = ref<Record<string, unknown>>({
        autocomplete: '验收设备',
        number: 7,
        select: 'east',
        selectV2: 'west',
        timeSelect: '09:30',
        treeSelect: 'location-a',
        radio: 'accept',
        switch: true,
        rate: 3,
        slider: 35,
        colorPicker: '#409EFF',
        segment: 'day',
        radioGroup: 'east',
        checkboxGroup: ['east', 'west']
      })
      const options = [
        { label: '华东区域', value: 'east' },
        { label: '西部区域', value: 'west' }
      ]
      const groupOptions = [
        { label: '华东仓储运输调度中心', value: 'east' },
        { label: '西部区域配送协作中心', value: 'west' },
        { label: '南部跨区运输协调中心', value: 'south' }
      ]
      const fields: FormItem[] = [
        {
          key: 'autocomplete',
          label: '联想设备',
          type: 'autocomplete',
          props: { fetchSuggestions: [{ value: '验收设备' }], triggerOnFocus: false }
        },
        {
          key: 'number',
          label: '登记数量',
          type: 'number',
          props: { min: 0, controlsPosition: 'right', ...ownSmallSize }
        },
        { key: 'select', label: '所属区域', type: 'select', options, props: { multiple: false } },
        {
          key: 'selectV2',
          label: '协作区域',
          type: 'selectV2',
          options,
          formItemProps: size === 'small' ? { size: 'large' } : undefined,
          props: { multiple: false }
        },
        {
          key: 'timeSelect',
          label: '班次时间',
          type: 'timeSelect',
          props: { start: '08:00', step: '00:30', end: '18:00' }
        },
        {
          key: 'treeSelect',
          label: '保管库位',
          type: 'treeSelect',
          options: [{ label: '一号库位', value: 'location-a' }],
          props: { multiple: false, nodeKey: 'value', checkStrictly: true }
        },
        {
          key: 'radio',
          label: '单项确认',
          type: 'radio',
          props: { label: '确认登记', value: 'accept' }
        },
        { key: 'switch', label: '自动提醒', type: 'switch' },
        { key: 'rate', label: '服务评分', type: 'rate' },
        { key: 'slider', label: '完成进度', type: 'slider', props: { showTooltip: false } },
        { key: 'colorPicker', label: '标识颜色', type: 'colorPicker' },
        {
          key: 'segment',
          label: '统计周期',
          type: 'segment',
          options: [
            { label: '每日', value: 'day' },
            { label: '每周', value: 'week' },
            { label: '每月', value: 'month' }
          ],
          props: { ...ownSmallSize }
        },
        { key: 'radioGroup', label: '主责中心', type: 'radioGroup', options: groupOptions },
        {
          key: 'checkboxGroup',
          label: '协作中心',
          type: 'checkboxGroup',
          options: groupOptions,
          props: emptySize ? { optionType: 'button' } : undefined
        }
      ]
      const form = ref<InstanceType<typeof ArtForm>>()
      const submissions = ref(0)
      const resets = ref(0)
      const submitted = ref('尚未提交')
      const renderFieldRegistry = () => {
        const nativeForm = unref(form.value?.ref)
        return h(
          'div',
          {
            hidden: true,
            'data-testid': 'native-field-registry',
            'data-field-count': String(nativeForm?.fields.length ?? 0)
          },
          fields.map((item) => {
            const field = nativeForm?.getField(item.key)
            return h('output', {
              'data-native-field-key': item.key,
              'data-input-ids': field?.inputIds.join(' ') ?? '',
              'data-label-id': field?.labelId ?? '',
              'data-declared-for': field?.for ?? ''
            })
          })
        )
      }
      const renderForm = () =>
        h(ArtForm, {
          ref: form,
          modelValue: values.value,
          'onUpdate:modelValue': (value) => (values.value = value),
          items: fields,
          span: 24,
          ...(inheritSize || emptySize ? {} : { size }),
          showSubmit: true,
          showReset: true,
          submitText: '保存原生形状',
          resetText: '重置原生形状',
          onSubmit: (value: Record<string, unknown>) => {
            submitted.value = JSON.stringify(value)
            submissions.value++
          },
          onReset: () => resets.value++
        })
      return () =>
        h('main', { class: 'mx-auto min-w-0 max-w-4xl p-4' }, [
          h('h1', { class: 'mb-4 text-xl font-semibold' }, '原生控件占位形状清单'),
          inheritSize ? h(ElConfigProvider, { size }, { default: renderForm }) : renderForm(),
          renderFieldRegistry(),
          h(
            'output',
            { 'data-testid': 'native-placeholder-values', hidden: true },
            JSON.stringify(values.value)
          ),
          h(
            'output',
            { 'data-testid': 'native-placeholder-ready', hidden: true },
            String(unref(form.value?.controlsReady))
          ),
          h(
            'output',
            { 'data-testid': 'native-placeholder-submissions', hidden: true },
            String(submissions.value)
          ),
          h(
            'output',
            { 'data-testid': 'native-placeholder-resets', hidden: true },
            String(resets.value)
          ),
          h('output', { 'data-testid': 'native-placeholder-output', hidden: true }, submitted.value)
        ])
    }
    if (params.has('placeholder-geometry')) {
      document.documentElement.dataset.uiScope = 'workspace'
      const requestedSize = params.get('size')
      const size =
        requestedSize === 'small' || requestedSize === 'large' ? requestedSize : 'default'
      const inheritSize = params.has('size-provider')
      const values = ref<Record<string, unknown>>({
        name: '保留的业务名称',
        date: '2026-11-19',
        acknowledged: true,
        notes: '保留的多行说明\n第二行内容用于核对长文本控件高度。',
        smallName: '字段级小号输入',
        largeDate: '2026-11-20',
        longAlias: '通过 input 类型配置的长文本\n字段类型覆盖后仍应使用多行高度。'
      })
      const form = ref<InstanceType<typeof ArtForm>>()
      const submits = ref(0)
      const resets = ref(0)
      const submitted = ref('尚未提交')
      const dateProps = { format: 'YYYY-MM-DD', valueFormat: 'YYYY-MM-DD', clearable: false }
      const fields: FormItem[] = [
        { key: 'name', label: '业务名称', type: 'input' },
        { key: 'date', label: '业务日期', type: 'date', props: dateProps },
        {
          key: 'acknowledged',
          label: '业务确认',
          type: 'checkbox',
          props: { label: '确认信息无误' }
        },
        { key: 'notes', label: '业务说明', type: 'textarea' },
        { key: 'smallName', label: '小号字段', type: 'input', formItemProps: { size: 'small' } },
        {
          key: 'largeDate',
          label: '大号字段日期',
          type: 'date',
          props: { ...dateProps, size: 'large' }
        },
        { key: 'longAlias', label: '覆盖类型长文本', type: 'input', props: { type: 'textarea' } }
      ]
      if (params.has('cascader-boundary')) {
        const cascaderOptions = [
          {
            label: '华东仓储协同区域',
            value: 'east',
            children: [
              { label: '跨区域物流园区首期运营一号仓库', value: 'warehouse-a' },
              { label: '跨区域物流园区首期运营二号仓库', value: 'warehouse-b' }
            ]
          }
        ]
        Object.assign(values.value, {
          cascaderPath: ['east', 'warehouse-a'],
          cascaderSmall: ['east', 'warehouse-b'],
          userSmall: 'reviewer',
          cascaderAnchor: '级联边界后的原生锚点',
          cascaderMulti: [
            ['east', 'warehouse-a'],
            ['east', 'warehouse-b']
          ],
          cascaderPrefix: ['east', 'warehouse-a']
        })
        fields.push(
          {
            key: 'cascaderPath',
            label: '继承大号的单路径',
            type: 'cascader',
            options: cascaderOptions,
            props: { props: { multiple: false, emitPath: true } }
          },
          {
            key: 'cascaderSmall',
            label: '显式小号的单路径',
            type: 'cascader',
            formItemProps: { size: 'large' },
            options: cascaderOptions,
            props: { size: 'small', props: { multiple: false, emitPath: true } }
          },
          {
            key: 'userSmall',
            label: '显式小号审批人',
            type: 'userSelect',
            formItemProps: { size: 'large' },
            options: [{ label: '值班审核员', value: 'reviewer' }],
            props: { size: 'small', multiple: false }
          },
          { key: 'cascaderAnchor', label: '单选后的原生锚点', type: 'input' },
          {
            key: 'cascaderMulti',
            label: '多路径换行边界',
            type: 'cascader',
            options: cascaderOptions,
            props: { collapseTags: false, props: { multiple: true, emitPath: true } }
          },
          {
            key: 'cascaderPrefix',
            label: '高前缀边界',
            type: 'cascader',
            options: cascaderOptions,
            props: { props: { multiple: false, emitPath: true } },
            slots: {
              prefix: () =>
                h(
                  'span',
                  {
                    'data-testid': 'cascader-tall-prefix',
                    style: { display: 'block', width: '48px', height: '64px', lineHeight: '64px' }
                  },
                  '前缀'
                )
            }
          }
        )
      }
      const renderForm = () =>
        h(ArtForm, {
          ref: form,
          modelValue: values.value,
          'onUpdate:modelValue': (value) => (values.value = value),
          items: fields,
          span: 24,
          ...(inheritSize ? {} : { size }),
          showSubmit: true,
          showReset: true,
          submitText: '保存布局表单',
          resetText: '重置布局表单',
          onSubmit: (value: Record<string, unknown>) => {
            submitted.value = JSON.stringify(value)
            submits.value++
          },
          onReset: () => resets.value++
        })
      return () =>
        h('main', { class: 'mx-auto min-w-0 max-w-4xl p-4' }, [
          h('h1', { class: 'mb-4 text-xl font-semibold' }, '表单控件加载布局'),
          inheritSize ? h(ElConfigProvider, { size }, { default: renderForm }) : renderForm(),
          h(
            'output',
            { 'data-testid': 'placeholder-values', hidden: true },
            JSON.stringify(values.value)
          ),
          h(
            'output',
            { 'data-testid': 'placeholder-ready', hidden: true },
            String(unref(form.value?.controlsReady))
          ),
          h(
            'output',
            { 'data-testid': 'placeholder-submissions', hidden: true },
            String(submits.value)
          ),
          h('output', { 'data-testid': 'placeholder-resets', hidden: true }, String(resets.value)),
          h('output', { 'data-testid': 'placeholder-output', hidden: true }, submitted.value)
        ])
    }
    if (params.has('registry-boundary')) {
      document.documentElement.dataset.uiScope = 'workspace'
      const mode = params.get('registry-boundary')
      const values = ref<Record<string, unknown>>({
        name: '初始名称',
        hiddenName: '初始隐藏值',
        summary: '全部范围',
        nestedName: '',
        dividerName: '',
        tabName: '',
        advanced: '保留的高级值',
        tenantId: ''
      })
      const boundaryForm = ref<InstanceType<typeof ArtForm>>()
      const boundarySearch = ref<InstanceType<typeof ArtSearchBar>>()
      const nativeShown = ref(false)
      const slotMode = ref<'full' | 'absent' | 'empty'>('full')
      const checked = ref('尚未校验')
      const submitted = ref('尚未提交')
      const submissionCount = ref(0)
      const resetCount = ref(0)
      const firstRefResult = ref('尚未取得函数ref')
      let firstRefCaptured = false
      const captureFirstRef = (instance: unknown) => {
        if (mode !== 'fields' || !instance || firstRefCaptured) return
        if (
          typeof instance !== 'object' ||
          !('controlsReady' in instance) ||
          !('validate' in instance) ||
          typeof instance.validate !== 'function'
        )
          throw new Error('首次函数ref未取得标准ArtForm公开接口')
        firstRefCaptured = true
        const ready = Boolean(unref(instance.controlsReady))
        firstRefResult.value = JSON.stringify({ ready, pending: true })
        void Promise.resolve(
          instance.validate((valid: boolean, fields?: Record<string, unknown>) => {
            firstRefResult.value = JSON.stringify({ ready, valid, keys: Object.keys(fields ?? {}) })
          })
        ).catch((error: unknown) => {
          firstRefResult.value = JSON.stringify({
            ready,
            unexpected: true,
            keys: typeof error === 'object' && error !== null ? Object.keys(error) : []
          })
        })
      }
      let validationCount = 0
      const validate = async (callback: boolean) => {
        const target = mode === 'query' ? boundarySearch.value : boundaryForm.value
        if (!target) throw new Error('控件依赖边界表单尚未挂载')
        let valid = false
        let keys: string[] = []
        try {
          if (callback) {
            await target.validate((result, fields) => {
              valid = result
              keys = Object.keys(fields ?? {})
            })
          } else valid = (await target.validate()) === true
        } catch (error) {
          keys = typeof error === 'object' && error !== null ? Object.keys(error) : []
        }
        checked.value = JSON.stringify({ sequence: ++validationCount, valid, keys })
      }
      const submit = (value: Record<string, unknown>) => {
        submitted.value = JSON.stringify(value)
        submissionCount.value++
      }
      const composite = (scope: { value: unknown; setValue: (value: unknown) => void }) => {
        if (slotMode.value === 'empty') return []
        return h(
          'div',
          { class: 'flex min-w-0 items-center gap-2', 'data-testid': 'boundary-composite' },
          [
            h(ElInput, {
              class: 'min-w-0 flex-1',
              modelValue: String(scope.value ?? ''),
              'onUpdate:modelValue': scope.setValue,
              ariaLabel: '组合名称',
              'data-testid': 'boundary-composite-input'
            }),
            h(
              'button',
              {
                type: 'button',
                class: 'shrink-0 whitespace-nowrap',
                onClick: () => scope.setValue('组合补全名称')
              },
              '补全名称'
            )
          ]
        )
      }
      const mixedItems: FormItem[] = [
        {
          key: 'hiddenName',
          label: '隐藏原生字段',
          type: 'input',
          hidden: () => !nativeShown.value
        },
        {
          key: 'name',
          label: '独立渲染名称',
          type: 'input',
          render: () =>
            h(ElInput, {
              modelValue: String(values.value.name ?? ''),
              'onUpdate:modelValue': (value: string) => (values.value.name = value),
              ariaLabel: '独立渲染名称'
            })
        },
        { key: 'summary', label: '当前范围', type: 'text' },
        { key: 'tenantId', label: '所属租户', type: 'select' }
      ]
      const hiddenItems: FormItem[] = [
        {
          key: 'hiddenName',
          label: '隐藏原生字段',
          type: 'input',
          hidden: () => !nativeShown.value
        }
      ]
      const slotItems: FormItem[] = [{ key: 'name', label: '名称', type: 'input' }]
      const fieldItems: FormItem[] = [
        ...(params.has('nested-layout')
          ? ([
              { key: 'overview', label: '概览', type: 'tab' },
              { key: 'summary', label: '当前范围', type: 'text' },
              { key: 'details', label: '详情', type: 'tab' },
              {
                key: 'compositionSection',
                label: '组合分区',
                type: 'divider',
                props: { defaultCollapsed: true }
              }
            ] satisfies FormItem[])
          : []),
        { key: 'composition', label: '组合字段', type: 'slot' }
      ]
      const childItems: FormItem[] = [{ key: 'nestedName', label: '子业务名称', type: 'input' }]
      const queryItems: FormItem[] = [
        { key: 'name', label: '名称', type: 'input' },
        { key: 'summary', label: '当前范围', type: 'text' },
        { key: 'advanced', label: '高级关键词', type: 'input' }
      ]
      const mountedItems: FormItem[] = [
        { key: 'overview', label: '概览', type: 'tab' },
        { key: 'summary', label: '当前范围', type: 'text' },
        { key: 'collapsed', label: '折叠分区', type: 'divider', props: { defaultCollapsed: true } },
        { key: 'dividerName', label: '分区名称', type: 'input' },
        { key: 'details', label: '详情', type: 'tab' },
        { key: 'tabName', label: '页签名称', type: 'input' }
      ]
      const boundaryRules =
        mode === 'fields'
          ? { nestedName: [{ required: true, message: '请填写子业务名称' }] }
          : mode === 'mounted'
            ? {
                dividerName: [{ required: true, message: '请填写分区名称' }],
                tabName: [{ required: true, message: '请填写页签名称' }]
              }
            : mode === 'hidden'
              ? { hiddenName: [{ required: true, message: '请填写隐藏字段' }] }
              : { name: [{ required: true, message: '请填写名称' }] }
      const button = (label: string, action: () => void) =>
        h('button', { type: 'button', onClick: action }, label)
      return () =>
        h('main', { class: 'min-w-0 space-y-3 p-4' }, [
          h('h1', { class: 'text-xl' }, '实际渲染控件依赖边界'),
          h('nav', { class: 'flex flex-wrap gap-3', 'aria-label': '控件依赖边界切换' }, [
            button('显示原生字段', () => (nativeShown.value = true)),
            button('隐藏原生字段', () => (nativeShown.value = false)),
            button('完整命名插槽', () => (slotMode.value = 'full')),
            button('移除命名插槽', () => (slotMode.value = 'absent')),
            button('命名插槽返回空', () => (slotMode.value = 'empty')),
            button('修改隐藏值', () => (values.value.hiddenName = '修改后的隐藏草稿')),
            button('Promise边界校验', () => void validate(false)),
            button('回调边界校验', () => void validate(true))
          ]),
          mode === 'query'
            ? h(
                ArtSearchBar,
                {
                  ref: boundarySearch,
                  modelValue: values.value,
                  'onUpdate:modelValue': (value) => (values.value = value),
                  items: queryItems,
                  rules: boundaryRules,
                  span: 8,
                  onSearch: submit,
                  onReset: () => resetCount.value++
                },
                { name: composite }
              )
            : cloneVNode(
                h(
                  ArtForm,
                  {
                    ref: boundaryForm,
                    modelValue: values.value,
                    'onUpdate:modelValue': (value) => (values.value = value),
                    items:
                      mode === 'mixed'
                        ? mixedItems
                        : mode === 'hidden'
                          ? hiddenItems
                          : mode === 'fields'
                            ? fieldItems
                            : mode === 'mounted'
                              ? mountedItems
                              : slotItems,
                    rules: boundaryRules,
                    tenantScopeMode: 'read',
                    span: 24,
                    showSubmit: true,
                    showReset: true,
                    submitText: '边界提交',
                    resetText: '边界重置',
                    onSubmit: submit,
                    onReset: () => resetCount.value++
                  },
                  mode === 'fields'
                    ? {
                        composition: ({ fields }: { fields: Component }) =>
                          h('div', { 'data-testid': 'boundary-sub-schema' }, [
                            h('p', '组合中的独立子字段'),
                            h(fields, { items: childItems, actions: false })
                          ])
                      }
                    : mode === 'slot' && slotMode.value !== 'absent'
                      ? { name: composite }
                      : {}
                ),
                { ref: captureFirstRef },
                true
              ),
          h(
            'output',
            { 'data-testid': 'boundary-values', hidden: true },
            JSON.stringify(values.value)
          ),
          h('output', { 'data-testid': 'boundary-validation', hidden: true }, checked.value),
          h('output', { 'data-testid': 'boundary-output', hidden: true }, submitted.value),
          h(
            'output',
            { 'data-testid': 'boundary-submissions', hidden: true },
            String(submissionCount.value)
          ),
          h('output', { 'data-testid': 'boundary-resets', hidden: true }, String(resetCount.value)),
          h(
            'output',
            { 'data-testid': 'boundary-native-shown', hidden: true },
            String(nativeShown.value)
          ),
          h('output', { 'data-testid': 'boundary-slot-mode', hidden: true }, slotMode.value),
          h('output', { 'data-testid': 'boundary-first-ref', hidden: true }, firstRefResult.value),
          h(
            'output',
            { 'data-testid': 'boundary-ready', hidden: true },
            String(unref(boundaryForm.value?.controlsReady))
          )
        ])
    }
    if (params.has('native-display')) {
      document.documentElement.dataset.uiScope = 'workspace'
      type DisplayProps = Partial<
        Pick<FormProps, 'size' | 'inline' | 'requireAsteriskPosition' | 'labelSuffix'>
      >
      const displayProps = ref<DisplayProps>({})
      const values = ref<Record<string, unknown>>({ name: '业务草稿', alias: '显示草稿', code: '' })
      const nativeValue = ref('原生尺寸参考')
      const overlay = ref<ArtDialogExpose>()
      const queryMode = params.has('query')
      const fields: FormItem[] = [
        {
          key: 'name',
          label: '业务名称',
          help: '按现有业务名称填写。',
          type: 'input',
          formItemProps: { required: true }
        },
        {
          key: 'alias',
          label: () => h('span', { 'data-testid': 'component-label' }, '显示别名'),
          help: '组件标签的填写提示。',
          type: 'input',
          formItemProps: { required: true }
        }
      ]
      if (!queryMode)
        fields.push(
          { key: 'settings', label: '业务设置', type: 'divider', span: 24 },
          {
            key: 'code',
            label: '跨组织业务名称显示方式',
            help: '跨组织业务显示方式的填写提示。',
            type: 'input',
            span: 24
          }
        )
      const presets: { label: string; props: DisplayProps }[] = [
        { label: '删除原生展示属性', props: {} },
        { label: '仅添加标签后缀', props: { labelSuffix: '：' } },
        {
          label: '小号行内右星标',
          props: {
            size: 'small',
            inline: true,
            requireAsteriskPosition: 'right',
            labelSuffix: '：'
          }
        },
        {
          label: '大号非行内左星标',
          props: { size: 'large', inline: false, requireAsteriskPosition: 'left', labelSuffix: '' }
        },
        {
          label: '默认号行内右星标',
          props: {
            size: 'default',
            inline: true,
            requireAsteriskPosition: 'right',
            labelSuffix: '：'
          }
        }
      ]
      const content = () => [
        h(
          'div',
          { role: 'group', 'aria-label': '原生展示属性切换', class: 'mb-4 flex flex-wrap gap-2' },
          presets.map((preset) =>
            h(
              'button',
              { type: 'button', onClick: () => (displayProps.value = { ...preset.props }) },
              preset.label
            )
          )
        ),
        h(ElInput, {
          ...(displayProps.value.size ? { size: displayProps.value.size } : {}),
          modelValue: nativeValue.value,
          'onUpdate:modelValue': (value: string) => (nativeValue.value = value),
          ariaLabel: '原生尺寸参考',
          class: 'mb-4',
          'data-testid': 'native-size-reference'
        }),
        queryMode
          ? h(ArtSearchBar, {
              ...displayProps.value,
              modelValue: values.value,
              'onUpdate:modelValue': (value) => (values.value = value),
              items: fields,
              span: 12,
              labelWidth: 120,
              showExpand: false,
              onSearch: (value) => (output.value = JSON.stringify(value))
            })
          : h(ArtForm, {
              ...displayProps.value,
              modelValue: values.value,
              'onUpdate:modelValue': (value: Record<string, unknown>) => (values.value = value),
              items: fields,
              span: 12
            })
      ]
      return () =>
        h('main', { class: 'p-4' }, [
          ...(params.has('overlay')
            ? [
                h(
                  'button',
                  { type: 'button', onClick: () => void overlay.value?.handleOpen() },
                  '打开展示属性弹窗'
                ),
                h(
                  ArtDialog,
                  { ref: overlay, title: '展示属性弹窗', showFooter: false },
                  { default: content }
                )
              ]
            : content()),
          h(
            'output',
            { 'data-testid': 'native-display-values', hidden: true },
            JSON.stringify(values.value)
          ),
          h('output', { 'data-testid': 'query-output', hidden: true }, output.value)
        ])
    }
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
