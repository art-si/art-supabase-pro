import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import BusinessRecordLink from '@/components/business/business-record-link/index.vue'
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
      h('output', { class: 'sr-only', 'aria-label': '已选记录' }, selected.value)
    ])
})
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
app.mount('#smis-record-link')
