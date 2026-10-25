import { createApp, h, ref, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import ArtTable from '@/components/core/tables/art-table/index.vue'
import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
import ArtTableMultipleSelect from '@/components/core/forms/art-data-select/table-multiple.vue'
import type { DataSelectFetchParams } from '@/components/core/forms/art-data-select/types'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const records = Array.from({ length: 54 }, (_, index) => ({
  id: String(index),
  code: `MAT-${index}`,
  name: `测试物料 ${index}`,
  description: '用于表格参选布局验收'
}))
const columns = Array.from({ length: 20 }, (_, index) => ({
  prop: `field${index}`,
  label: `明细字段 ${index + 1}`,
  width: 140,
  ...(index === 19 ? { fixed: 'right' as const } : {})
}))
const rows = Array.from({ length: 20 }, (_, index) => ({
  id: index,
  ...Object.fromEntries(columns.map((column) => [column.prop, `${column.label} · ${index + 1}`]))
}))
const app = createApp({
  setup() {
    const dialog = shallowRef<InstanceType<typeof ArtDialog>>()
    const selector = shallowRef<InstanceType<typeof ArtTableMultipleSelect>>()
    const count = ref(20)
    return () =>
      h('main', { class: 'p-4' }, [
        h('button', { onClick: () => selector.value?.open() }, '打开三栏物料参选'),
        h(ArtTableMultipleSelect, {
          ref: selector,
          title: '参选物料布局验收',
          dialogWidth: new URLSearchParams(location.search).has('width')
            ? Number(new URLSearchParams(location.search).get('width'))
            : undefined,
          navigation: {
            title: '物料分类',
            allLabel: '全部分类',
            data: [{ id: 'raw', parentId: null, label: '原材料' }]
          },
          columns: [
            { prop: 'code', label: '物料编码', width: 160 },
            { prop: 'name', label: '物料名称', width: 160 },
            { prop: 'description', label: '物料描述', minWidth: 220 }
          ],
          labelKey: 'name',
          apiFn: ({ page, pageSize }: DataSelectFetchParams) => ({
            data: records.slice((page - 1) * pageSize, page * pageSize),
            total: records.length
          })
        }),
        h(
          'button',
          {
            onClick: () =>
              dialog.value?.handleOpen(undefined, {
                title: '多列明细布局验收',
                size: 'xl',
                showFooter: true
              })
          },
          '打开多列明细'
        ),
        h(
          ArtDialog,
          { ref: dialog },
          {
            default: () => [
              h('div', { class: 'flex gap-3' }, [
                h('button', { onClick: () => (count.value = 6) }, '减少到六行'),
                h('button', { onClick: () => (count.value = 20) }, '恢复二十行')
              ]),
              h(ArtTable, {
                data: rows.slice(0, count.value),
                columns,
                pagination: false,
                maxHeight: 280,
                scrollbarAlwaysOn: true,
                showSummary: true,
                rowKey: 'id'
              }),
              h('p', {}, '表格下方的业务汇总与操作区域')
            ]
          }
        )
      ])
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'layout-test',
  tenantId: 'layout-tenant',
  platformSuper: false
})
app.mount('#table-scroll-layout')
