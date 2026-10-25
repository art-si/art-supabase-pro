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
const empty = new URLSearchParams(location.search).has('empty')
const renderQuery = () =>
  h(
    ArtTableQuery,
    {
      data: empty ? [] : [{ id: 'test', name: '验收记录' }],
      pagination: { current: 1, size: 20, total: empty ? 0 : 41 },
      tableProps: { emptyText: '暂无验收记录' },
      tableColumns: [{ prop: 'name', label: '业务记录' }],
      showTableHeader: false
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
      h(
        'section',
        { style: { height: '500px', display: 'flex', flexDirection: 'column' } },
        new URLSearchParams(location.search).has('cache')
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
