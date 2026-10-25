import { createApp, h, ref } from 'vue'
import BusinessMobileFilterContext from '@/components/business/business-mobile-filter-context/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const actions = ref(0)

createApp({
  render: () =>
    h('main', { class: 'art-page-view mx-auto max-w-3xl p-4' }, [
      h(BusinessMobileFilterContext, {
        label: '当前组织范围',
        value: '华东运营中心 · 上海仓储与运输协同组织',
        actionLabel: '组织筛选',
        onAction: () => {
          actions.value++
        }
      }),
      h('output', { class: 'sr-only', 'aria-label': '操作次数' }, String(actions.value))
    ])
}).mount('#mobile-filter-context')
