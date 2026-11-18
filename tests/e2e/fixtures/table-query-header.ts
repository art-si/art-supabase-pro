import { createApp, h, KeepAlive, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import ArtTableQuery from '@/components/core/tables/art-table-query/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: {} }]
})
const mounted = ref(true)
const expanded = ref(false)
const query = new URLSearchParams(location.search)
const empty = query.has('empty')
const toolbar = query.has('toolbar')
const virtualSelection = query.has('virtual-selection')
const columnFilter = query.has('column-filter')
const filterRows = ['A', 'B'].map((key) => ({
  id: key,
  name: `业务记录 ${key}`,
  code: `华北生产基地运输合同及配套业务验证仓库运输结算编码 CONNECT-${key}`
}))
const loading = ref(false)
const startTableRequest = () => {
  loading.value = true
}
const renderQuery = () =>
  h(
    ArtTableQuery,
    {
      data: columnFilter ? filterRows : empty ? [] : [{ id: 'test', name: '验收记录' }],
      pagination: { current: 1, size: 20, total: empty ? 0 : 41 },
      tableProps: {
        emptyText: '暂无验收记录',
        ...(virtualSelection ? { virtualScroll: true, height: 320 } : {})
      },
      tableColumns: [
        ...(virtualSelection ? [{ type: 'selection' as const }] : []),
        { prop: 'name', label: '业务记录' },
        ...(columnFilter ? [{ prop: 'code', label: '编码', filterType: 'select' as const }] : [])
      ],
      columns: toolbar ? [{ prop: 'name', label: '业务记录', checked: true }] : undefined,
      showTableHeader: toolbar,
      showTableToolbar: toolbar,
      searchItems: toolbar ? [{ key: 'name', label: '关键词', type: 'input' }] : undefined,
      loading: loading.value,
      onRefresh: startTableRequest,
      onSearch: startTableRequest,
      selectionActions: virtualSelection
        ? [{ key: 'selection-test', label: '批量处理' }]
        : undefined
    },
    {
      'table-header-top': () =>
        h('div', { style: { height: expanded.value ? '120px' : '40px' } }, '顶部业务区域')
    }
  )
const app = createApp({
  render: () =>
    h('main', { style: { padding: '16px' } }, [
      h(
        'button',
        {
          onClick: () => {
            expanded.value = !expanded.value
          }
        },
        '切换顶部高度'
      ),
      h(
        'button',
        {
          onClick: () => {
            mounted.value = !mounted.value
          }
        },
        '切换表格挂载'
      ),
      toolbar
        ? h(
            'button',
            {
              onClick: () => {
                loading.value = false
              }
            },
            '完成表格请求'
          )
        : null,
      h(
        'section',
        {
          style: {
            height: query.has('table-flow') ? 'auto' : '500px',
            display: 'flex',
            flexDirection: 'column'
          }
        },
        query.has('cache')
          ? h(KeepAlive, {}, { default: () => (mounted.value ? renderQuery() : null) })
          : mounted.value
            ? [renderQuery()]
            : []
      )
    ])
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.push('/')
await router.isReady()
app.mount('#table-query-header')
