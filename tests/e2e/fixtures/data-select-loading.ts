import { createApp, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import ArtTableMultipleSelect from '@/components/core/forms/art-data-select/table-multiple.vue'
import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
import ArtTable from '@/components/core/tables/art-table/index.vue'
import type { ArtDataSelectExpose } from '@/components/core/forms/art-data-select/types'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const selector = ref<ArtDataSelectExpose>()
const loading = ref(true)
const rows = ref<{ id: string; label: string }[]>([])
const result = ref('未确认')
const empty = new URLSearchParams(location.search).has('empty')
const singleMode = new URLSearchParams(location.search).get('single')
const tableMode = new URLSearchParams(location.search).get('table')
const emptyLayoutMode = new URLSearchParams(location.search).has('empty-layout')
const tablePage = ref(1)
const singleRows = Array.from({ length: 21 }, (_, index) => ({
  id: `row-${index + 1}`,
  label: `选择项 ${index + 1}`
}))
const tableRows = Array.from({ length: 210 }, (_, index) => ({
  id: `row-${index + 1}`,
  label: `选择项 ${index + 1}`
}))
const app = createApp({
  render: () =>
    emptyLayoutMode
      ? h('main', { class: 'p-4' }, [
          h('button', { onClick: () => (loading.value = !loading.value) }, '切换加载'),
          h(
            'button',
            {
              onClick: () =>
                (rows.value = rows.value.length
                  ? []
                  : [{ id: 'summary-row', label: '汇总测试明细' }])
            },
            '切换数据'
          ),
          h(ArtTable, {
            columns: [{ prop: 'label', label: '名称' }],
            data: rows.value,
            loading: loading.value,
            height: 400,
            showSummary: true,
            emptyText: '暂无可查看的业务明细',
            emptyDescription: '当前筛选条件下没有可查看的业务明细，请调整筛选条件后重新加载。',
            showPagination: false
          })
        ])
      : tableMode !== null
        ? h('main', { class: 'h-screen p-4' }, [
            h(ArtTable, {
              columns:
                tableMode === 'fixed'
                  ? [
                      { prop: 'id', label: '编号', width: 140, fixed: 'left' as const },
                      { prop: 'label', label: '名称', minWidth: 1000 },
                      {
                        prop: 'operation',
                        label: '操作',
                        width: 100,
                        fixed: 'right' as const,
                        formatter: () => '测试操作'
                      }
                    ]
                  : [{ prop: 'label', label: '名称' }],
              data: tableRows.slice((tablePage.value - 1) * 10, tablePage.value * 10),
              height: 400,
              pagination: { total: tableRows.length, size: 10, current: tablePage.value },
              ...(tableMode === 'custom'
                ? { paginationOptions: { layout: 'prev, pager, next', pagerCount: 5 } }
                : {}),
              'onPagination:current-change': (value: number) => (tablePage.value = value)
            })
          ])
        : singleMode
          ? h('main', { class: 'p-4' }, [
              h('button', { onClick: () => selector.value?.open() }, '打开选择器'),
              h(ArtTableSingleSelect, {
                ref: selector,
                title: '单选分页测试',
                ...(singleMode === 'unresolved' ? { modelValue: 'not-loaded' } : {}),
                columns: [{ prop: 'label', label: '名称' }],
                data: singleMode === 'local' ? singleRows : [],
                apiFn:
                  singleMode === 'local'
                    ? undefined
                    : ({ page, pageSize }) => ({
                        data:
                          singleMode === 'unresolved'
                            ? []
                            : singleRows.slice((page - 1) * pageSize, page * pageSize),
                        total: singleMode === 'unresolved' ? 0 : singleRows.length
                      }),
                onConfirm: (value: unknown, records: object[]) => {
                  result.value = JSON.stringify({ value, records })
                },
                ...(singleMode === 'explicit' ? { showPagination: false } : {})
              }),
              h('output', { 'data-testid': 'selector-result' }, result.value)
            ])
          : h('main', { class: 'p-4' }, [
              h('button', { onClick: () => selector.value?.open() }, '打开选择器'),
              h(
                'button',
                {
                  onClick: async () => {
                    rows.value = empty ? [] : [{ id: 'fixture-line', label: '测试可选明细' }]
                    await nextTick()
                    await selector.value?.reload()
                    loading.value = false
                  }
                },
                '完成数据加载'
              ),
              h(
                ArtTableMultipleSelect,
                {
                  ref: selector,
                  data: rows.value,
                  loading: loading.value,
                  columns: [{ prop: 'label', label: '明细名称' }],
                  title: '选择测试明细',
                  showPagination: false,
                  emptyText: '暂无可选明细',
                  emptyDescription: '当前业务没有可选择的明细。',
                  onConfirm: (value: unknown) => {
                    result.value = JSON.stringify(value)
                  }
                },
                {
                  empty: () =>
                    h(
                      'button',
                      {
                        onClick: () => {
                          result.value = 'maintenance-requested'
                        }
                      },
                      '维护测试明细'
                    )
                }
              ),
              h('output', { 'data-testid': 'selector-result' }, result.value)
            ])
})
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
setupGlobDirectives(app)
app.mount('#selector-loading-preview')
