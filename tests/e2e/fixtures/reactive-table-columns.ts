import { createApp, defineComponent, h, ref } from 'vue'
import language from '@/locales'
import { store } from '@/store'
import { useTableColumns } from '@/hooks/core/useTableColumns'
import ArtTable from '@/components/core/tables/art-table/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

createApp(
  defineComponent({
    setup() {
      const permitted = ref(false)
      const nameLabel = ref('业务名称')
      const columns = useTableColumns(() => [
        { prop: 'name', label: nameLabel.value },
        { prop: 'id', label: '编号' },
        ...(permitted.value ? [{ prop: 'amount', label: '金额' }] : [])
      ])
      const button = (label: string, action: () => void) =>
        h('button', { type: 'button', onClick: action }, label)
      return () =>
        h('main', { class: 'art-page-view p-4' }, [
          h('div', { class: 'flex flex-wrap gap-4 mb-4' }, [
            button('允许金额', () => {
              permitted.value = true
            }),
            button('撤回金额', () => {
              permitted.value = false
            }),
            button('隐藏名称', () => columns.toggleColumn('name', false)),
            button('显示名称', () => columns.toggleColumn('name', true)),
            button('调整列顺序', () => columns.reorderColumns(0, 1)),
            button('更改名称标签', () => {
              nameLabel.value = '更新后的名称'
            }),
            button('重置列设置', () => columns.resetColumns())
          ]),
          h(ArtTable, {
            data: [{ id: 'RECORD-001', name: '测试记录', amount: 1234 }],
            columns: columns.columns.value,
            pagination: false
          })
        ])
    }
  })
)
  .use(store)
  .use(language)
  .mount('#app')
