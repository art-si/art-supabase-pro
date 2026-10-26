import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import BusinessRecordLink from '@/components/business/business-record-link/index.vue'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const selected = ref('')
const records = [
  {
    label: '华东区域综合应急救援预案（2026 年修订版）',
    meta: 'ERP-2026-001',
    title: '查看应急救援预案：华东区域综合应急救援预案（2026 年修订版）'
  },
  {
    label: '危险化学品泄漏综合演练计划',
    meta: 'DRILL-PLAN-001',
    title: '查看演练计划：危险化学品泄漏综合演练计划'
  },
  {
    label: '危险化学品泄漏综合演练记录',
    meta: 'DRILL-RECORD-001',
    title: '查看演练记录：危险化学品泄漏综合演练记录'
  }
]
const sourceRecords = [
  {
    label: 'CWYF-20261025-000000000000000001',
    title: '查看来源单据详情',
    interactive: true
  },
  {
    label: 'CYSDZ-20261025-000000000000000002',
    title: '暂无来源单据查看权限'
  },
  {
    label: 'CGRK-20261025-000000000000000003',
    title: '查看来源采购入库',
    to: '/source'
  }
]

const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view mx-auto grid max-w-xl gap-3 p-4' }, [
      ...records.map((record) =>
        h('section', { class: 'art-card-xs min-w-0' }, [
          h(BusinessRecordLink, {
            ...record,
            interactive: true,
            compact: true,
            onClick: () => {
              selected.value = record.meta
            }
          })
        ])
      ),
      ...sourceRecords.map((record) =>
        h(
          'section',
          {
            class: 'art-card-xs min-w-0',
            style: { width: '192px', maxWidth: '100%' },
            'aria-label': '来源编号截断验收'
          },
          [
            h(BusinessRecordLink, {
              ...record,
              compact: true,
              onClick: () => {
                selected.value = record.label
              }
            })
          ]
        )
      ),
      h('output', { class: 'sr-only', 'aria-label': '已选记录' }, selected.value)
    ])
})
app.use(store)
const parameters = new URLSearchParams(location.search)
const setting = useSettingStore(store)
const theme = parameters.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
setting.setGlobalTheme(theme, theme)
setting.boxBorderMode = parameters.get('box') !== 'shadow-mode'
document.documentElement.dataset.boxMode = setting.boxBorderMode ? 'border-mode' : 'shadow-mode'
initializeTheme()
setting.setCustomRadius(setting.customRadius)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
app.mount('#smis-record-link')
