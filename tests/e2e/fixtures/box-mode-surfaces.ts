import { createApp, h, ref } from 'vue'
import {
  ElButton,
  ElCard,
  ElDatePicker,
  ElDialog,
  ElDrawer,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElInput,
  ElInputNumber,
  ElMenu,
  ElMenuItem,
  ElOption,
  ElPopover,
  ElSelect,
  ElTable,
  ElTableColumn
} from 'element-plus'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import language from '@/locales'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

type BoxMode = 'border-mode' | 'shadow-mode'

const root = document.documentElement
root.dataset.uiScope = 'workspace'
root.dataset.boxMode = 'border-mode'

const app = createApp({
  setup() {
    const text = ref('')
    const choice = ref('')
    const date = ref('')
    const dialogVisible = ref(false)
    const drawerVisible = ref(false)
    const editableRows = [
      { id: 'sample-1', note: '演示输入', priority: 'normal', quantity: 3 },
      { id: 'sample-2', note: '演示选择', priority: 'urgent', quantity: 5 },
      { id: 'sample-3', note: '演示校验', priority: 'normal', quantity: 0 }
    ]

    const setMode = (mode: BoxMode) => {
      root.dataset.boxMode = mode
    }
    const setTheme = (dark: boolean) => {
      root.classList.toggle('dark', dark)
    }

    return () =>
      h('main', { class: 'box-mode-fixture p-5', style: 'max-width: 920px' }, [
        h('div', { class: 'mb-4 flex flex-wrap gap-2' }, [
          h('button', { type: 'button', onClick: () => setMode('border-mode') }, '边框模式'),
          h('button', { type: 'button', onClick: () => setMode('shadow-mode') }, '阴影模式'),
          h('button', { type: 'button', onClick: () => setTheme(false) }, '浅色主题'),
          h('button', { type: 'button', onClick: () => setTheme(true) }, '深色主题')
        ]),
        h(
          'div',
          {
            class: 'grid gap-3',
            style: 'grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))'
          },
          [
            h(ElInput, {
              modelValue: text.value,
              'onUpdate:modelValue': (value: string) => (text.value = value),
              placeholder: '普通输入框',
              'aria-label': '普通输入框'
            }),
            h(ElInput, { modelValue: '不可编辑', disabled: true, 'aria-label': '禁用输入框' }),
            h(
              ElSelect,
              {
                modelValue: choice.value,
                'onUpdate:modelValue': (value: string) => (choice.value = value),
                placeholder: '选择状态',
                'aria-label': '选择状态'
              },
              () => [
                h(ElOption, { label: '启用', value: 'enabled' }),
                h(ElOption, { label: '停用', value: 'disabled' })
              ]
            ),
            h(ElDatePicker, {
              modelValue: date.value,
              'onUpdate:modelValue': (value: string) => (date.value = value),
              type: 'date',
              placeholder: '选择日期',
              'aria-label': '选择日期'
            }),
            h(ElInput, {
              modelValue: text.value,
              'onUpdate:modelValue': (value: string) => (text.value = value),
              type: 'textarea',
              placeholder: '备注',
              'aria-label': '备注'
            })
          ]
        ),
        h('div', { class: 'mt-4 flex flex-wrap items-center gap-3' }, [
          h(
            ElButton,
            { class: 'fixture-icon-button', title: '刷新', 'aria-label': '刷新' },
            () => '↻'
          ),
          h(
            ElPopover,
            { trigger: 'click', content: '操作提示', width: 180 },
            {
              reference: () => h(ElButton, { class: 'fixture-popover-trigger' }, () => '打开提示')
            }
          ),
          h(
            ElDropdown,
            { trigger: 'click' },
            {
              default: () => h(ElButton, { class: 'fixture-dropdown-trigger' }, () => '打开菜单'),
              dropdown: () =>
                h(ElDropdownMenu, null, () => [
                  h(ElDropdownItem, null, () => '刷新数据'),
                  h(ElDropdownItem, null, () => '导出列表')
                ])
            }
          ),
          h(ElButton, { onClick: () => (dialogVisible.value = true) }, () => '打开弹窗'),
          h(ElButton, { onClick: () => (drawerVisible.value = true) }, () => '打开抽屉')
        ]),
        h(ElCard, { class: 'fixture-card mt-4' }, () => '卡片内容'),
        h('section', { class: 'fixture-editable-table mt-4', 'aria-label': '演示可编辑表格' }, [
          h('h2', { class: 'mb-2 text-sm' }, '演示可编辑表格'),
          h(ElTable, { data: editableRows }, () => [
            h(ElTableColumn, { prop: 'id', label: '示例编号', minWidth: 120 }),
            h(
              ElTableColumn,
              { label: '备注', minWidth: 180 },
              {
                default: ({ row }: { row: (typeof editableRows)[number] }) =>
                  h(
                    'div',
                    {
                      class:
                        row.id === 'sample-3'
                          ? 'art-table__cell-content is-validation-error'
                          : 'art-table__cell-content'
                    },
                    [
                      h(ElInput, {
                        modelValue: row.note,
                        'onUpdate:modelValue': (value: string) => (row.note = value),
                        'aria-label': `${row.id} 备注`
                      })
                    ]
                  )
              }
            ),
            h(
              ElTableColumn,
              { label: '优先级', minWidth: 150 },
              {
                default: ({ row }: { row: (typeof editableRows)[number] }) =>
                  h(
                    ElSelect,
                    {
                      modelValue: row.priority,
                      'onUpdate:modelValue': (value: string) => (row.priority = value),
                      'aria-label': `${row.id} 优先级`
                    },
                    () => [
                      h(ElOption, { label: '普通', value: 'normal' }),
                      h(ElOption, { label: '紧急', value: 'urgent' })
                    ]
                  )
              }
            ),
            h(
              ElTableColumn,
              { label: '数量', minWidth: 150 },
              {
                default: ({ row }: { row: (typeof editableRows)[number] }) =>
                  h(ElInputNumber, {
                    modelValue: row.quantity,
                    'onUpdate:modelValue': (value: number | undefined) =>
                      (row.quantity = value ?? 0),
                    controls: false,
                    min: 0,
                    'aria-label': `${row.id} 数量`
                  })
              }
            )
          ])
        ]),
        h(ElMenu, { class: 'fixture-menu mt-4', defaultActive: 'one' }, () => [
          h(ElMenuItem, { index: 'one' }, () => '概览'),
          h(ElMenuItem, { index: 'two' }, () => '报表')
        ]),
        h(
          ElDialog,
          {
            modelValue: dialogVisible.value,
            'onUpdate:modelValue': (value: boolean) => (dialogVisible.value = value),
            title: '测试弹窗'
          },
          () => '弹窗内容'
        ),
        h(
          ElDrawer,
          {
            modelValue: drawerVisible.value,
            'onUpdate:modelValue': (value: boolean) => (drawerVisible.value = value),
            title: '测试抽屉'
          },
          () => '抽屉内容'
        )
      ])
  }
})

app.use(store)
app.use(language)
useSettingStore(store).setCustomRadius('0.75')
app.mount('#box-mode-surfaces')
