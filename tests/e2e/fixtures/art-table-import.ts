import { createApp, h } from 'vue'
import { ElMessage } from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import { useSupabase } from '@/hooks/core/useSupabase'
import language from '@/locales'
import { store } from '@/store'
import ArtTableQuery, {
  type ArtTableQueryHeaderAction
} from '@/components/core/tables/art-table-query/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(window.location.search).get('mode')
const importAction: ArtTableQueryHeaderAction = {
  key: 'import-preview',
  type: 'import',
  label: '导入测试数据',
  importColumns: [{ key: 'name', title: '名称', required: true }],
  importApi: async (rows) => {
    document.body.dataset.receivedRows = String(rows.length)
    document.body.dataset.receivedRecords = JSON.stringify(rows)
    if (mode === 'reject') {
      await new Promise<void>((resolve) => {
        document.addEventListener('release-import', () => resolve(), { once: true })
      })
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 300))
    }
    if (mode === 'reject') throw new Error('请先在顶部选择导入目标租户')
    if (mode === 'reported') {
      const { responseHandle } = useSupabase()
      await responseHandle(
        async () => ({ data: null, error: { code: '23514', message: '站点编码重复' } }),
        { showMessage: true, breakReturn: true }
      )
    }
  },
  onImportSuccess: () => {
    document.body.dataset.importStatus = 'success'
    ElMessage.success('导入成功')
  },
  onImportError: () => {
    document.body.dataset.importStatus = 'parse-error'
    ElMessage.error('导入文件解析失败')
  }
}

document.body.dataset.receivedRows = '0'
if (mode === 'records' || mode === 'records-invalid') {
  importAction.importRecordTransformer = (rows) => rows.map((row) => ({ ...row, remark: 'mapped' }))
} else if (mode === 'raw') {
  importAction.importTransformer = (rows) =>
    rows.map((row) => ({ name: row['名称'], remark: 'raw' }))
}

const app = createApp({
  render: () =>
    h('main', { class: 'p-6' }, [
      h('h1', { class: 'mb-4 text-xl' }, '表格导入反馈验收'),
      h(ArtTableQuery, {
        data: [],
        tableColumns: [{ prop: 'name', label: '名称' }],
        headerActions: [importAction],
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
app.mount('#table-import-preview')
