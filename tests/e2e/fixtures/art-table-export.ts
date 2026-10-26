import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import ArtTableQuery from '@/components/core/tables/art-table-query/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(location.search).get('mode')
let failed = false
const app = createApp({
  render: () =>
    h('main', { class: 'p-4' }, [
      h('h1', { class: 'mb-4 text-xl' }, '表格分页导出验收'),
      h(ArtTableQuery, {
        apiFn: async (params: Record<string, unknown>) => {
          const page = Number(params.page)
          const size = Number(params.limit)
          if (size === 500) {
            const requests = JSON.parse(document.body.dataset.requests || '[]') as number[]
            requests.push(page)
            document.body.dataset.requests = JSON.stringify(requests)
            if (mode === 'incomplete' && page === 2 && !failed) {
              failed = true
              return { rows: [], total: 1001 }
            }
          }
          const total = mode === 'dictionary' ? 2 : mode === 'over-limit' ? 10001 : 1001
          const offset = (page - 1) * size
          return {
            rows: Array.from({ length: Math.max(0, Math.min(size, total - offset)) }, (_, i) => ({
              id: offset + i,
              name: `测试记录-${offset + i}`,
              status: offset + i === 0 ? 'approved' : 'retired',
              classification: { kind: 'financial' },
              active: false,
              quantity: 0
            })),
            total
          }
        },
        paginationKey: { current: 'page', size: 'limit' },
        columnsFactory: () => [
          { prop: 'name', label: '名称' },
          ...(mode === 'dictionary'
            ? [
                {
                  prop: 'state',
                  label: '状态',
                  dict: { code: 'qaExportState', value: (row: { status: string }) => row.status }
                },
                { prop: 'classification.kind', label: '类别', dict: { code: 'qaExportKind' } },
                {
                  prop: 'active',
                  label: '启用',
                  dict: {
                    code: 'commonBoolean',
                    value: (row: { active: boolean }) => String(row.active)
                  }
                },
                {
                  prop: 'quantity',
                  label: '数量',
                  formatter: (row: { quantity: number }) => row.quantity
                }
              ]
            : [])
        ],
        headerActions: [{ key: 'export', type: 'export', exportFilename: '分页导出验收' }],
        showSearchBar: false
      })
    ])
})
app.use(store)
if (mode === 'dictionary')
  useUserStore(store).setDictMap({
    qaExportState: [
      { name: '已审核', label: '已审核', value: 'approved', code: 'approved', status: '1' }
    ],
    qaExportKind: [
      { name: '财务应付', label: '', value: 'financial', code: 'financial', status: '1' }
    ],
    commonBoolean: [{ name: '否', label: '否', value: 'false', code: 'false', status: '1' }]
  })
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
app.use(language)
setupGlobDirectives(app)
app.mount('#table-export-preview')
