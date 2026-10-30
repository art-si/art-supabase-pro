import { createApp, defineComponent, h, ref } from 'vue'
import { ElButton, ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import type { ColumnOption, TableEditConfig } from '@/types'
import ArtTable, { type ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
import { store } from '@/store'
import language from '@/locales'
import { initializeTheme } from '@/hooks/core/useTheme'
import { setupGlobDirectives } from '@/directives'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

interface Row {
  id: number
  name: string
}

type Scenario = 'normal' | 'loading' | 'disabled' | 'before' | 'clear'

const Preview = defineComponent({
  setup() {
    const params = new URLSearchParams(location.search)
    const batchMode = params.has('batch')
    const virtual = params.get('virtual') === '1'
    const rows: Row[] = Array.from({ length: virtual ? 1200 : batchMode ? 3 : 1 }, (_, index) => ({
      id: index + 1,
      name: batchMode ? `记录 ${index + 1}` : '可编辑记录'
    }))
    const loading = ref(false)
    const disabled = ref(false)
    const allowed = ref(true)
    const activated = ref(0)
    const result = ref('idle')
    const active = ref('none')
    const batchReport = ref('idle')
    let removedByCall: number[] = []
    const table = ref<ArtTableExpose<Row>>()
    const columns: ColumnOption<Row>[] = [
      { prop: 'id', label: '编号', width: 100 },
      {
        prop: 'name',
        label: '名称',
        editRender: { name: 'input', disabled: () => disabled.value }
      }
    ]
    const editConfig: TableEditConfig = {
      mode: 'cell',
      trigger: 'dblclick',
      beforeEditMethod: () => allowed.value
    }

    const run = async (scenario: Scenario) => {
      const pending = table.value?.setEditCell(rows[0], 'name')
      if (!pending) throw new Error('ArtTable public edit API unavailable')
      if (scenario === 'loading') loading.value = true
      if (scenario === 'disabled') disabled.value = true
      if (scenario === 'before') allowed.value = false
      if (scenario === 'clear') table.value?.clearEdit()
      const accepted = await pending
      result.value = String(accepted)
      active.value = table.value?.getEditRecord()?.prop ?? 'none'
    }
    const captureBatch = () => {
      const api = table.value
      if (!api) throw new Error('ArtTable public batch API unavailable')
      const data = api.getTableData()
      const records = api.getRecordset()
      batchReport.value = JSON.stringify({
        virtual: api.getRenderMode().virtual,
        rowCount: data.length,
        firstId: data[0]?.id,
        lastId: data.at(-1)?.id,
        hasSameIdForeignTarget: data.some((row) => row.id === 2),
        insertedIds: records.insertRecords.map((row) => row.id),
        removedIds: records.removeRecords.map((row) => row.id),
        removedByCall,
        sourceCount: rows.length,
        sourceFirstId: rows[0]?.id
      })
    }
    const runBatch = () => {
      const api = table.value
      if (!api) throw new Error('ArtTable public batch API unavailable')
      const [inserted] = api.insertAt({ id: rows.length + 1, name: '新增记录' }, -1)
      if (!inserted) throw new Error('ArtTable insertAt returned no working row')
      const removed = api.remove([rows[0], inserted, rows[0], { id: 2, name: '记录 2' }])
      removedByCall = removed.map((row) => row.id)
      captureBatch()
    }
    const undoBatch = () => {
      table.value?.undo()
      captureBatch()
    }
    const redoBatch = () => {
      table.value?.redo()
      captureBatch()
    }

    return () =>
      h('main', { class: 'min-h-screen p-6' }, [
        h('h1', { class: 'mb-4 text-xl font-semibold' }, 'ArtTable 编辑激活竞态验收'),
        h(
          'div',
          { class: 'mb-4 flex flex-wrap gap-2' },
          (['normal', 'loading', 'disabled', 'before', 'clear'] as const).map((scenario) =>
            h(
              ElButton,
              { onClick: () => void run(scenario), 'data-testid': `start-${scenario}` },
              () => `开始 ${scenario}`
            )
          )
        ),
        ...(batchMode
          ? [
              h('div', { class: 'mb-4 flex gap-2' }, [
                h(ElButton, { onClick: runBatch, 'data-testid': 'batch-remove' }, () => '批量移除'),
                h(ElButton, { onClick: undoBatch, 'data-testid': 'batch-undo' }, () => '撤销移除'),
                h(ElButton, { onClick: redoBatch, 'data-testid': 'batch-redo' }, () => '重做移除')
              ])
            ]
          : []),
        h(ArtTable, {
          ref: table,
          data: rows,
          columns,
          editConfig,
          loading: loading.value,
          pagination: false,
          showTableHeader: false,
          virtualScroll: virtual,
          height: virtual ? 360 : undefined,
          rowKey: 'id',
          'onEdit-activated': () => activated.value++
        }),
        h('p', { 'data-testid': 'edit-result' }, result.value),
        h('p', { 'data-testid': 'edit-activated' }, String(activated.value)),
        h('p', { 'data-testid': 'edit-active-record' }, active.value),
        h('output', { 'data-testid': 'batch-report' }, batchReport.value)
      ])
  }
})

const app = createApp({ render: () => h(ElConfigProvider, { locale: zhCn }, () => h(Preview)) })
app.use(store)
app.use(language)
initializeTheme()
setupGlobDirectives(app)
app.mount('#table-edit-activation-race')
