import { createApp, h, ref } from 'vue'
import language from '@/locales'
import { store } from '@/store'
import BusinessWorkspaceHeader, {
  type BusinessWorkspaceMetric
} from '@/components/business/business-workspace-header/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const theme = params.get('theme') === 'dark' ? 'dark' : 'light'
document.documentElement.classList.toggle('dark', theme === 'dark')
document.documentElement.dataset.theme = theme
document.documentElement.dataset.boxMode =
  params.get('box') === 'shadow-mode' ? 'shadow-mode' : 'border-mode'
const count = Math.min(5, Math.max(1, Number(params.get('count')) || 4))
const clicked = ref('尚未选择')
const metrics: BusinessWorkspaceMetric[] = Array.from({ length: count }, (_, index) => ({
  key: `metric-${index}`,
  label: index === 0 ? '当期累计待结算业务总金额' : `业务指标 ${index + 1}`,
  value: index === 0 ? '¥123,456,789,012.34' : index + 1,
  description: '当前筛选范围的业务统计说明',
  icon: 'ri:stack-line',
  interactive: true,
  selected: index === 0,
  loading: index === 1
}))
const app = createApp({
  render: () =>
    h('main', { class: 'p-4' }, [
      h(BusinessWorkspaceHeader, {
        title: '业务概览',
        description: '集中查看当前范围的业务指标与处理进度。',
        icon: 'ri:dashboard-line',
        metrics,
        density: params.get('density') === 'compact' ? 'compact' : 'default',
        onMetricClick: (metric: BusinessWorkspaceMetric) => {
          clicked.value = metric.label
        }
      }),
      h('output', { 'aria-live': 'polite' }, clicked.value)
    ])
})
app.use(store)
app.use(language)
app.mount('#workspace-header-preview')
