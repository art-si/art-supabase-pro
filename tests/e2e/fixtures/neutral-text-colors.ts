import 'element-plus/theme-chalk/src/index.scss'
import '@/assets/styles/core/tailwind.css'
import { createApp, h } from 'vue'
import { ElInput, ElSelect, ElOption, ElTreeSelect, ElCascader, ElDatePicker } from 'element-plus'
import '@/assets/styles/index.scss'
createApp({
  render: () =>
    h('main', { class: 'p-4 bg-[var(--el-bg-color)]' }, [
      ...['bg-color', 'fill-color-lighter'].map((background) =>
        h(
          'section',
          { style: { backgroundColor: 'var(--el-' + background + ')' } },
          ['primary', 'regular', 'secondary'].map((role) =>
            h(
              'p',
              { class: 'neutral-text', style: { color: 'var(--el-text-color-' + role + ')' } },
              background + ' ' + role
            )
          )
        )
      ),
      h(
        'section',
        { class: 'grid gap-4 sm:grid-cols-2', 'aria-label': '表单文字层级' },
        ['input', 'textarea', 'select', 'tree', 'cascader', 'date'].map((kind) =>
          h('div', { 'data-kind': kind, class: 'grid gap-2' }, [
            h('h2', {}, kind),
            ...['empty', 'selected', 'disabled'].map((state) => {
              const props = {
                placeholder: '请选择生成方式',
                disabled: state === 'disabled'
              }
              const value = state === 'empty' ? undefined : '是'
              const renderControl = () => {
                if (kind === 'input' || kind === 'textarea')
                  return h(ElInput, {
                    ...props,
                    type: kind === 'textarea' ? 'textarea' : 'text',
                    modelValue: value
                  })
                if (kind === 'select')
                  return h(ElSelect, { ...props, modelValue: value }, () => [
                    h(ElOption, { label: '是', value: '是' }),
                    h(ElOption, { label: '否', value: '否' }),
                    h(ElOption, { label: '禁用选项', value: 'disabled', disabled: true })
                  ])
                if (kind === 'tree')
                  return h(ElTreeSelect, {
                    ...props,
                    modelValue: value,
                    data: [{ label: '是', value: '是' }]
                  })
                if (kind === 'cascader')
                  return h(ElCascader, {
                    ...props,
                    modelValue: value ? ['是'] : undefined,
                    options: [{ label: '是', value: '是' }]
                  })
                return h(ElDatePicker, {
                  ...props,
                  modelValue: value ? '2026-10-12' : undefined,
                  valueFormat: 'YYYY-MM-DD'
                })
              }
              return h('div', { 'data-state': state }, [renderControl()])
            })
          ])
        )
      )
    ])
}).mount('#app')
