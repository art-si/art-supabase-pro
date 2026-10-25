<template>
  <div ref="rootRef" class="screen-trend-chart">
    <div ref="chartRef" class="screen-trend-chart__canvas" role="img" :aria-label="chartSummary" />
  </div>
</template>

<script setup lang="ts">
  import type { EChartsOption } from '@/plugins/echarts'
  import { echarts } from '@/plugins/echarts'
  import { useChartComponent } from '@/hooks/core/useChart'
  import type { BaseChartProps } from '@/types/component/chart'
  import { useScreenChartTheme } from './screen-chart-theme'

  export interface ScreenTrendPoint {
    label: string
    primary: number
    secondary?: number
  }

  interface Props extends BaseChartProps {
    points: ScreenTrendPoint[]
    primaryLabel?: string
    secondaryLabel?: string
    unit?: string
    variant?: 'area' | 'line' | 'bar' | 'step'
  }

  const props = withDefaults(defineProps<Props>(), {
    primaryLabel: '总量',
    secondaryLabel: '风险',
    unit: '',
    variant: 'area',
    isEmpty: false
  })
  const { rootRef, readScreenColor } = useScreenChartTheme()
  const chartSummary = computed(
    () =>
      `${props.primaryLabel}趋势：${props.points
        .map((point) => `${point.label} ${point.primary}${props.unit}`)
        .join('，')}`
  )

  const { chartRef, getAnimationConfig } = useChartComponent({
    props,
    watchSources: [
      () => props.points,
      () => props.primaryLabel,
      () => props.secondaryLabel,
      () => props.variant
    ],
    generateOptions: (): EChartsOption => {
      const accent = readScreenColor('--screen-accent-soft', '#817aff')
      const cyan = readScreenColor('--screen-cyan', '#35c7d7')
      const danger = readScreenColor('--screen-danger', '#ff6474')
      const strong = readScreenColor('--screen-text-strong', '#f4f8ff')
      const muted = readScreenColor('--screen-text-muted', '#84a0b8')
      const gridLine = readScreenColor('--screen-chart-grid', 'rgba(120, 157, 187, 0.13)')
      const hasSecondary = props.points.some((point) => point.secondary !== undefined)
      const isBar = props.variant === 'bar'
      const isStep = props.variant === 'step'
      const showArea = props.variant === 'area'

      return {
        animation: false,
        grid: { left: 30, right: 8, top: 22, bottom: 20 },
        legend: {
          top: 0,
          right: 6,
          itemWidth: 8,
          itemHeight: 3,
          textStyle: { color: muted, fontSize: 11 },
          data: hasSecondary ? [props.primaryLabel, props.secondaryLabel] : [props.primaryLabel]
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            type: 'line',
            lineStyle: { color: gridLine, width: 1 }
          },
          confine: true,
          backgroundColor: 'rgba(5, 17, 29, 0.95)',
          borderColor: gridLine,
          textStyle: { color: strong, fontSize: 13 }
        },
        xAxis: {
          type: 'category',
          boundaryGap: isBar,
          data: props.points.map((point) => point.label),
          axisLine: { lineStyle: { color: gridLine } },
          axisTick: { show: false },
          axisLabel: { color: muted, fontSize: 11, hideOverlap: true }
        },
        yAxis: {
          type: 'value',
          minInterval: 1,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: muted, fontSize: 11 },
          splitLine: { lineStyle: { color: gridLine, type: 'dashed' } }
        },
        series: [
          {
            name: props.primaryLabel,
            type: isBar ? 'bar' : 'line',
            smooth: !isStep,
            step: isStep ? 'middle' : undefined,
            symbol: 'circle',
            symbolSize: 5,
            barMaxWidth: 24,
            data: props.points.map((point) => point.primary),
            lineStyle: { width: 2, color: cyan },
            itemStyle: {
              color: isBar
                ? new echarts.graphic.LinearGradient(0, 1, 0, 0, [
                    { offset: 0, color: accent },
                    { offset: 1, color: cyan }
                  ])
                : cyan,
              borderRadius: isBar ? [4, 4, 0, 0] : 0
            },
            emphasis: { disabled: true },
            areaStyle: showArea
              ? {
                  color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(53, 199, 215, 0.32)' },
                    { offset: 1, color: 'rgba(53, 199, 215, 0.01)' }
                  ])
                }
              : undefined,
            ...getAnimationConfig(100, 900)
          },
          ...(hasSecondary
            ? [
                {
                  name: props.secondaryLabel,
                  type: isBar ? ('bar' as const) : ('line' as const),
                  smooth: !isStep,
                  step: isStep ? ('middle' as const) : undefined,
                  symbol: 'circle',
                  symbolSize: 4,
                  barMaxWidth: 14,
                  data: props.points.map((point) => point.secondary ?? 0),
                  lineStyle: { width: 1.5, color: danger },
                  itemStyle: { color: danger, borderRadius: isBar ? [4, 4, 0, 0] : 0 },
                  emphasis: { disabled: true },
                  ...getAnimationConfig(220, 900)
                }
              ]
            : [])
        ],
        color: [accent, danger]
      }
    }
  })
</script>

<style scoped lang="scss">
  .screen-trend-chart,
  .screen-trend-chart__canvas {
    width: 100%;
    height: 100%;
    min-height: 0;
  }
</style>
