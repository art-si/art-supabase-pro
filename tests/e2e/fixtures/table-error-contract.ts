import { createApp, h } from 'vue'
import { ElButton } from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useTable } from '@/hooks/core/useTable'
import ArtTableQuery, {
  type ArtTableQueryHeaderAction
} from '@/components/core/tables/art-table-query/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

interface Row {
  id: number
  name: string
  error?: string
}

const mode = new URLSearchParams(location.search).get('mode') || 'raw'
const businessError = new Error('select * from private_table where tenant_id = secret')
const goodRow: Row = { id: 1, name: '恢复后的记录' }
const forbiddenRow: Row = { id: 2, name: 'must-not-show' }
let listAttempts = 0
let adapterCalls = 0
let exportAttempts = 0
let exportAdapterCalls = 0
let successCalls = 0
let errorCalls = 0

const setCounters = (): void => {
  document.body.dataset.listAttempts = String(listAttempts)
  document.body.dataset.adapterCalls = String(adapterCalls)
  document.body.dataset.exportAttempts = String(exportAttempts)
  document.body.dataset.exportAdapterCalls = String(exportAdapterCalls)
  document.body.dataset.successCalls = String(successCalls)
  document.body.dataset.errorCalls = String(errorCalls)
}

const cacheProbe = {
  setup() {
    let requests = 0
    let hits = 0
    const table = useTable<Row>({
      core: {
        apiFn: async () => {
          requests += 1
          document.body.dataset.cacheRequests = String(requests)
          return requests === 1
            ? { data: [forbiddenRow], total: 1, error: businessError }
            : { data: [goodRow], total: 1, error: null }
        },
        immediate: false
      },
      performance: { enableCache: true },
      hooks: {
        onCacheHit: () => {
          hits += 1
          document.body.dataset.cacheHits = String(hits)
        }
      }
    })
    return () =>
      h('main', { class: 'p-6' }, [
        h('h1', { class: 'mb-4 text-xl' }, '表格错误与缓存验收'),
        h(ElButton, { onClick: () => void table.fetchData() }, () => '读取缓存探针'),
        h('p', { 'data-testid': 'cache-state' }, table.error.value ? '读取失败' : '读取正常'),
        h('p', { 'data-testid': 'cache-rows' }, table.data.value.map((row) => row.name).join('、'))
      ])
  }
}

const exportAction: ArtTableQueryHeaderAction = {
  key: 'export',
  type: 'export',
  exportFilename: '错误契约导出',
  exportApi: async () => {
    exportAttempts += 1
    setCounters()
    return mode === 'export-raw' && exportAttempts === 1
      ? { data: [forbiddenRow], total: 1, error: businessError }
      : { data: [goodRow], total: 1, error: null }
  },
  ...(mode.startsWith('export-')
    ? {
        exportResponseAdapter: () => {
          exportAdapterCalls += 1
          setCounters()
          return {
            records: exportAttempts === 1 ? [forbiddenRow] : [goodRow],
            total: 1,
            error: mode === 'export-adapted' && exportAttempts === 1 ? businessError : null
          }
        }
      }
    : {})
}

const app = createApp({
  render: () =>
    mode === 'cache'
      ? h(cacheProbe)
      : h(
          'main',
          {
            class: 'p-4',
            style:
              mode === 'bounded-error'
                ? { display: 'flex', flexDirection: 'column', height: '220px' }
                : undefined
          },
          [
            h('h1', { class: 'mb-4 text-xl' }, '表格错误契约验收'),
            h(ArtTableQuery, {
              apiFn: async () => {
                listAttempts += 1
                setCounters()
                if (mode === 'row')
                  return { data: [{ id: 3, name: '合法业务记录', error: '业务字段' }], total: 1 }
                if (mode.startsWith('export-') || listAttempts > 1)
                  return { data: [goodRow], total: 1, error: null }
                if (mode === 'nested')
                  return { data: { records: [forbiddenRow], total: 1, error: businessError } }
                if (mode === 'adapted') return { data: [forbiddenRow], total: 1, error: null }
                return { data: [forbiddenRow], total: 1, error: businessError }
              },
              ...(mode === 'mask' || mode === 'adapted'
                ? {
                    responseAdapter: () => {
                      adapterCalls += 1
                      setCounters()
                      return {
                        records: listAttempts === 1 ? [forbiddenRow] : [goodRow],
                        total: 1,
                        error: mode === 'adapted' && listAttempts === 1 ? businessError : null
                      }
                    }
                  }
                : {}),
              columnsFactory: () => [
                { prop: 'name', label: '名称' },
                { prop: 'error', label: '业务错误字段' }
              ],
              headerActions: mode.startsWith('export-') ? [exportAction] : [],
              onSuccess: () => {
                successCalls += 1
                setCounters()
              },
              onError: (error: { details?: unknown }) => {
                errorCalls += 1
                document.body.dataset.detailsIdentity = String(error.details === businessError)
                setCounters()
              },
              showSearchBar: false
            })
          ]
        )
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
setCounters()
app.mount('#table-error-contract-preview')
