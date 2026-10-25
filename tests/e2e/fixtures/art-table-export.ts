import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
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
          const total = mode === 'over-limit' ? 10001 : 1001
          const offset = (page - 1) * size
          return {
            rows: Array.from({ length: Math.max(0, Math.min(size, total - offset)) }, (_, i) => ({
              id: offset + i,
              name: `测试记录-${offset + i}`
            })),
            total
          }
        },
        paginationKey: { current: 'page', size: 'limit' },
        columnsFactory: () => [{ prop: 'name', label: '名称' }],
        headerActions: [{ key: 'export', type: 'export', exportFilename: '分页导出验收' }],
        showSearchBar: false
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
app.mount('#table-export-preview')
