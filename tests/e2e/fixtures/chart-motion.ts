import { createApp, h, ref, onMounted } from 'vue'
import { useChart } from '@/hooks/core/useChart'
import language from '@/locales'
import { store } from '@/store'
import { useIntervalFn } from '@vueuse/core'
import { echarts } from '@/plugins/echarts'
import ArtLineChart from '@/components/core/charts/art-line-chart/index.vue'
import ArtBarChart from '@/components/core/charts/art-bar-chart/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({
  setup() {
    const value = ref(7)
    const empty = ref(false)
    const state = ref('[]')
    const kind = new URLSearchParams(location.search).get('kind')
    const visible = ref(kind !== 'hidden')
    const delayed =
      kind === 'delayed' || kind === 'delayed-update' || kind === 'hidden' || kind === 'dispose'
        ? useChart({ initDelay: kind === 'delayed' || kind === 'delayed-update' ? 5000 : 0 })
        : undefined
    const initializeDelayed = () =>
      delayed?.initChart({
        xAxis: { type: 'category', data: ['本月'] },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: [kind === 'delayed-update' ? value.value : 23] }]
      })
    onMounted(() => {
      if (delayed) initializeDelayed()
    })
    useIntervalFn(() => {
      const element = document.querySelector<HTMLElement>('[_echarts_instance_]')
      const chart = element && echarts.getInstanceByDom(element)
      if (chart) {
        const option = chart.getOption()
        state.value = JSON.stringify({ animation: option.animation, series: option.series })
      }
    }, 50)
    return () =>
      h('main', { class: 'p-4' }, [
        h('button', { onClick: () => (visible.value = true) }, '显示图表'),
        h('button', { onClick: () => (visible.value = false) }, '隐藏图表'),
        h('button', { onClick: () => delayed?.destroyChart() }, '销毁图表'),
        h(
          'button',
          {
            onClick: () => {
              value.value = 23
              initializeDelayed()
            }
          },
          '更新统计'
        ),
        h(
          'button',
          {
            onClick: () => {
              empty.value = true
              delayed?.initChart({}, true)
            }
          },
          '清空统计'
        ),
        delayed
          ? h('div', {
              ref: delayed.chartRef,
              style: { height: '300px', display: visible.value ? '' : 'none' }
            })
          : h(
              new URLSearchParams(location.search).get('kind') === 'bar'
                ? ArtBarChart
                : ArtLineChart,
              {
                height: '300px',
                xAxisData: ['本月'],
                data: empty.value
                  ? []
                  : [
                      { name: '事故', data: [value.value] },
                      { name: '复核', data: [value.value + 1] }
                    ],
                animationDelay: 5000,
                symbol: 'circle'
              }
            ),
        h('output', { 'data-testid': 'chart-state', hidden: true }, state.value)
      ])
  }
})
app.use(store)
app.use(language)
app.mount('#chart-motion')
