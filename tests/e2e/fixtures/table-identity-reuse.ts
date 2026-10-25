import { createApp, h } from 'vue'
import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const identities = [
  {
    primary: '华东制造中心 · 总装与检测协同产线',
    secondary: '生产制造 / 华东工厂 / 总装车间',
    icon: 'ri:node-tree',
    iconTone: 'primary' as const
  },
  {
    primary: '特种设备年度检验类别',
    secondary: 'INSPECTION-CATEGORY-001',
    icon: 'ri:filter-3-line',
    iconTone: 'success' as const
  },
  {
    primary: '危险化学品储罐区重大风险点',
    secondary: '上海生产基地 · 罐区东侧',
    icon: 'ri:radar-line',
    iconTone: 'danger' as const
  }
]

createApp({
  render: () =>
    h('main', { class: 'art-page-view mx-auto grid max-w-lg gap-3 p-4' }, [
      ...identities.map((identity) =>
        h('section', { class: 'art-card-xs min-w-0 overflow-hidden' }, [
          h(BusinessTableIdentityCell, identity)
        ])
      )
    ])
}).mount('#table-identity-reuse')
