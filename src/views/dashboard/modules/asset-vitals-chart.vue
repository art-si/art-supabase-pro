<template>
  <div ref="rootRef" class="asset-vitals-chart">
    <div ref="chartRef" class="asset-vitals-chart__canvas" role="img" :aria-label="chartSummary" />
    <div class="asset-vitals-chart__legend" aria-hidden="true">
      <div v-for="item in vitals" :key="item.label" :class="`is-${item.tone}`">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}<em>%</em></strong>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { EChartsOption } from '@/plugins/echarts'
  import { useChartComponent } from '@/hooks/core/useChart'
  import type { BaseChartProps } from '@/types/component/chart'
  import { useScreenChartTheme } from './screen-chart-theme'

  interface Props extends BaseChartProps {
    health: number
    connectedRate: number
    inspectionRate: number
  }

  const props = withDefaults(defineProps<Props>(), { isEmpty: false })
  const { rootRef, readScreenColor } = useScreenChartTheme()
  const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)))
  const vitals = computed(() => [
    { label: '设备健康', value: clamp(props.health), tone: 'health' },
    { label: '信号接入', value: clamp(props.connectedRate), tone: 'signal' },
    { label: '点巡完成', value: clamp(props.inspectionRate), tone: 'inspection' }
  ])
  const chartSummary = computed(
    () => `设备生命体征：${vitals.value.map((item) => `${item.label} ${item.value}%`).join('，')}`
  )

  const { chartRef, getAnimationConfig } = useChartComponent({
    props,
    watchSources: [() => props.health, () => props.connectedRate, () => props.inspectionRate],
    generateOptions: (): EChartsOption => {
      const colors = [
        readScreenColor('--asset-green', '#20e3b2'),
        readScreenColor('--screen-cyan', '#35c7d7'),
        readScreenColor('--screen-accent', '#635bff')
      ]
      const strong = readScreenColor('--screen-text-strong', '#f4f8ff')
      const muted = readScreenColor('--screen-text-muted', '#84a0b8')
      const track = readScreenColor('--screen-chart-track', 'rgba(105, 168, 185, 0.12)')
      const radii = ['76%', '59%', '43%']
      const widths = [10, 8, 7]

      return {
        series: vitals.value.map((item, index) => ({
          type: 'gauge',
          startAngle: 220,
          endAngle: -40,
          min: 0,
          max: 100,
          radius: radii[index],
          center: ['50%', '54%'],
          pointer: { show: false },
          progress: {
            show: true,
            width: widths[index],
            roundCap: true,
            itemStyle: {
              color: colors[index],
              shadowBlur: index === 0 ? 14 : 8,
              shadowColor: `${colors[index]}55`
            }
          },
          axisLine: { roundCap: true, lineStyle: { width: widths[index], color: [[1, track]] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          anchor: { show: false },
          title: {
            show: false
          },
          detail: {
            show: index === 0,
            valueAnimation: true,
            offsetCenter: [0, '2%'],
            color: strong,
            formatter: (value: number) => `{score|${Math.round(value)}}{unit|%}`,
            rich: {
              score: { color: strong, fontSize: 31, fontWeight: 760 },
              unit: { color: muted, fontSize: 13, fontWeight: 700, padding: [0, 0, 0, 2] }
            }
          },
          data: [{ value: item.value, name: '综合健康度' }],
          ...getAnimationConfig(160 + index * 80, 1000)
        }))
      }
    }
  })
</script>

<style scoped lang="scss">
  .asset-vitals-chart {
    display: grid;
    grid-template-rows: minmax(0, 1fr) 38px;
    width: 100%;
    height: 100%;
    min-height: 0;

    &__canvas {
      width: 100%;
      height: 100%;
    }

    &__legend {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;

      > div {
        position: relative;
        display: grid;
        gap: 2px;
        justify-items: center;
        min-width: 0;
        padding-top: 5px;
        text-align: center;

        &::before {
          position: absolute;
          top: 0;
          left: 50%;
          width: 22px;
          height: 2px;
          content: '';
          background: var(--asset-green);
          border-radius: 2px;
          transform: translateX(-50%);
        }

        &.is-signal::before {
          background: var(--screen-cyan);
        }

        &.is-inspection::before {
          background: var(--screen-accent);
        }
      }

      span {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 10px;
        color: var(--screen-text-muted);
        white-space: nowrap;
      }

      strong {
        font-size: 15px;
        color: var(--screen-text-strong);
      }

      em {
        margin-left: 2px;
        font-size: 8px;
        font-style: normal;
        color: var(--screen-text-muted);
      }
    }
  }
</style>
