<template>
  <div ref="rootRef" class="asset-maintenance-window-chart">
    <div
      ref="chartRef"
      class="asset-maintenance-window-chart__canvas"
      role="img"
      :aria-label="chartSummary"
    />
  </div>
</template>

<script setup lang="ts">
  import dayjs from 'dayjs'
  import type { EChartsOption } from '@/plugins/echarts'
  import { echarts } from '@/plugins/echarts'
  import { useChartComponent } from '@/hooks/core/useChart'
  import type { BaseChartProps } from '@/types/component/chart'
  import { useScreenChartTheme } from './screen-chart-theme'

  export interface MaintenanceWindowItem {
    name: string
    dueDate: string
    planName: string
  }

  interface Props extends BaseChartProps {
    items: MaintenanceWindowItem[]
  }

  const props = withDefaults(defineProps<Props>(), { isEmpty: false })
  const { rootRef, readScreenColor } = useScreenChartTheme()
  const windows = [
    { label: '已逾期', min: Number.NEGATIVE_INFINITY, max: -1 },
    { label: '7天内', min: 0, max: 7 },
    { label: '8-14天', min: 8, max: 14 },
    { label: '15-21天', min: 15, max: 21 },
    { label: '22-30天', min: 22, max: 30 }
  ]
  const windowItems = computed(() => {
    const today = dayjs().startOf('day')
    return windows.map((window) => ({
      ...window,
      tasks: props.items.filter((item) => {
        const days = dayjs(item.dueDate).startOf('day').diff(today, 'day')
        return days >= window.min && days <= window.max
      })
    }))
  })
  const chartSummary = computed(
    () =>
      `未来 30 天保养任务：${windowItems.value
        .map((item) => `${item.label} ${item.tasks.length}项`)
        .join('，')}`
  )

  const { chartRef, getAnimationConfig } = useChartComponent({
    props,
    watchSources: [() => props.items],
    generateOptions: (): EChartsOption => {
      const green = readScreenColor('--asset-green', '#20e3b2')
      const cyan = readScreenColor('--screen-cyan', '#35c7d7')
      const warning = readScreenColor('--screen-warning', '#f4b653')
      const danger = readScreenColor('--screen-danger', '#ff6474')
      const strong = readScreenColor('--screen-text-strong', '#f4f8ff')
      const muted = readScreenColor('--screen-text-muted', '#84a0b8')
      const gridLine = readScreenColor('--screen-chart-grid', 'rgba(105, 168, 185, 0.12)')
      const colors = [danger, warning, green, cyan, readScreenColor('--screen-accent', '#635bff')]

      return {
        grid: { left: 6, right: 6, top: 24, bottom: 30, containLabel: false },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          backgroundColor: 'rgba(5, 17, 29, 0.95)',
          borderColor: gridLine,
          textStyle: { color: strong, fontSize: 11 },
          formatter: (params) => {
            const first = Array.isArray(params) ? params[0] : params
            if (!first || typeof first !== 'object' || !('dataIndex' in first)) return ''
            const bucket = windowItems.value[Number(first.dataIndex)]
            if (!bucket) return ''
            const tasks = bucket.tasks
              .slice(0, 4)
              .map((item) => item.name)
              .join('、')
            return `${bucket.label}<br/><strong>${bucket.tasks.length} 项</strong>${tasks ? `<br/>${tasks}` : ''}`
          }
        },
        xAxis: {
          type: 'category',
          data: windowItems.value.map((item) => item.label),
          axisLine: { lineStyle: { color: gridLine } },
          axisTick: { show: false },
          axisLabel: { interval: 0, margin: 9, color: muted, fontSize: 9 }
        },
        yAxis: {
          type: 'value',
          minInterval: 1,
          axisLabel: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: gridLine, type: 'dashed' } }
        },
        series: [
          {
            type: 'bar',
            data: windowItems.value.map((item, index) => ({
              value: item.tasks.length,
              itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 1, 0, 0, [
                  { offset: 0, color: `${colors[index]}88` },
                  { offset: 1, color: colors[index] }
                ])
              }
            })),
            barMaxWidth: 27,
            barMinHeight: 2,
            showBackground: true,
            backgroundStyle: { color: gridLine, borderRadius: 4 },
            itemStyle: { borderRadius: [4, 4, 1, 1] },
            label: {
              show: true,
              position: 'top',
              distance: 5,
              color: strong,
              fontSize: 11,
              fontWeight: 700,
              formatter: '{c}项'
            },
            ...getAnimationConfig(180, 900)
          }
        ]
      }
    }
  })
</script>

<style scoped lang="scss">
  .asset-maintenance-window-chart,
  .asset-maintenance-window-chart__canvas {
    width: 100%;
    height: 100%;
    min-height: 0;
  }
</style>
