import { createApp, h, ref } from 'vue'
import { store } from '@/store'
import { fetchDomainCommandData } from '@/api/domain-command'
const output = ref('未加载')
const app = createApp({
  render: () =>
    h('main', [
      h(
        'button',
        {
          onClick: async () => {
            try {
              const result = await fetchDomainCommandData('ai-safety')
              output.value = JSON.stringify({
                risk: result.riskCount,
                metrics: result.metrics,
                trend: result.trend,
                alerts: result.alerts.length
              })
            } catch {
              output.value = '加载失败'
            }
          }
        },
        '读取统计'
      ),
      h('output', { 'data-testid': 'result' }, output.value)
    ])
})
app.use(store)
app.mount('#ai-safety-counts')
