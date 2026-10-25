import { createApp, h, reactive, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElInput } from 'element-plus'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import ArtTable, { type ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
import type { ColumnOption } from '@/types'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

interface Row {
  id: string
  specification: string
  manufacturer: string
  quantity: string
}
const rows = reactive<Row[]>([
  { id: 'MAT-TEST', specification: '', manufacturer: '', quantity: '' }
])
const columns: ColumnOption<Row>[] = [
  { prop: 'id', label: '物料编码', width: 160, fixed: 'left' },
  {
    type: 'expand',
    width: 48,
    formatter: (row) =>
      h(
        'div',
        {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: '12px',
            padding: '16px'
          }
        },
        [
          h(ElInput, {
            modelValue: row.specification,
            'onUpdate:modelValue': (value: string) => (row.specification = value),
            'aria-label': '展开左侧规格'
          }),
          h(ElInput, {
            modelValue: row.manufacturer,
            'onUpdate:modelValue': (value: string) => (row.manufacturer = value),
            'aria-label': '展开生产厂家'
          })
        ]
      )
  },
  ...Array.from({ length: 12 }, (_, index) => ({
    prop: `field${index}`,
    label: `明细 ${index}`,
    width: 150
  })),
  {
    prop: 'quantity',
    label: '数量',
    width: 150,
    required: true,
    formatter: (row) =>
      h(ElInput, {
        modelValue: row.quantity,
        'onUpdate:modelValue': (value: string) => (row.quantity = value),
        'aria-label': '必填数量'
      })
  },
  {
    prop: 'operation',
    label: '操作',
    width: 80,
    fixed: 'right',
    formatter: () => h('button', { type: 'button' }, '操作')
  }
]
const app = createApp({
  setup() {
    const dialog = shallowRef<InstanceType<typeof ArtDialog>>()
    const table = shallowRef<ArtTableExpose>()
    return () =>
      h('main', { class: 'p-4' }, [
        h(
          'button',
          {
            onClick: () =>
              dialog.value?.handleOpen(undefined, { title: '展开行焦点验收', size: 'xl' })
          },
          '打开展开行'
        ),
        h(
          ArtDialog,
          { ref: dialog },
          {
            default: () => [
              h('button', { onClick: () => table.value?.validate() }, '校验右侧数量'),
              h(ArtTable, {
                ref: table,
                data: rows,
                columns,
                rowKey: 'id',
                pagination: false,
                height: 340,
                border: true
              })
            ]
          }
        )
      ])
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
app.mount('#table-expand-focus')
