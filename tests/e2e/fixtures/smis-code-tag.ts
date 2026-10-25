import { createApp, h } from 'vue'
import { ElTag } from 'element-plus'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const codes = ['INSPECTION-CATEGORY-2026-001', 'EQUIPMENT-CATEGORY-001', 'STORAGE-LOCATION-001']

createApp({
  render: () =>
    h('main', { class: 'art-page-view mx-auto grid max-w-md gap-3 p-4' }, [
      ...codes.map((code) =>
        h('section', { class: 'art-card-xs min-w-0 overflow-hidden' }, [
          h('span', { title: code }, [
            h(ElTag, { type: 'primary', effect: 'light', size: 'small', round: true }, () => code)
          ])
        ])
      )
    ])
}).mount('#smis-code-tag')
