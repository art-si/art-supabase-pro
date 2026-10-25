import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import ArtTableQuery from '@/components/core/tables/art-table-query/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const rows = [
  { id: 'payee-1', payeeName: '演示收款人甲', employeeNo: 'EMP-001', bankName: '演示银行' },
  { id: 'payee-2', payeeName: '演示收款人乙', employeeNo: 'EMP-002', bankName: '演示银行' }
]
const app = createApp({
  render: () =>
    h('main', { class: 'p-6' }, [
      h('h1', { class: 'mb-4 text-xl' }, '收款信息'),
      h(ArtTableQuery, {
        data: rows,
        tableColumns: [
          { type: 'selection', width: 50 },
          { prop: 'payeeName', label: '收款人', minWidth: 160 },
          { prop: 'employeeNo', label: '收款人工号', minWidth: 160 },
          { prop: 'bankName', label: '收款银行', minWidth: 180 }
        ],
        headerActions: [
          {
            key: 'deleteSelected',
            label: '批量删除',
            icon: 'ri:delete-bin-line',
            selectionRequired: true,
            onClick: () => undefined
          }
        ],
        showSearchBar: false,
        tableProps: { rowKey: 'id' }
      })
    ])
})
app.use(store)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
app.use(language)
setupGlobDirectives(app)
app.mount('#fms-selection-bar')
