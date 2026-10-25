<template>
  <div ref="rootRef" class="domain-insight-chart" :class="`is-${variant}`">
    <div
      ref="chartRef"
      class="domain-insight-chart__canvas"
      role="img"
      :aria-label="chartSummary"
    />
  </div>
</template>

<script setup lang="ts">
  import type { EChartsOption } from '@/plugins/echarts'
  import { echarts } from '@/plugins/echarts'
  import { useChartComponent } from '@/hooks/core/useChart'
  import type { BaseChartProps } from '@/types/component/chart'
  import type { DomainCommandChartItem, DomainCommandChartVariant } from '@/api/domain-command'
  import { useScreenChartTheme } from './screen-chart-theme'

  interface Props extends BaseChartProps {
    items: DomainCommandChartItem[]
    variant: DomainCommandChartVariant
    title?: string
    unit?: string
  }

  const props = withDefaults(defineProps<Props>(), {
    title: '结构分布',
    unit: '',
    isEmpty: false
  })
  const { rootRef, readScreenColor } = useScreenChartTheme()
  const total = computed(() => props.items.reduce((sum, item) => sum + Math.max(0, item.value), 0))
  const chartSummary = computed(() =>
    props.items.some((item) => item.value !== 0)
      ? `${props.title}：${props.items.map((item) => `${item.label} ${item.value}${props.unit}`).join('，')}`
      : `${props.title}：当前均为零`
  )

  const { chartRef, getAnimationConfig } = useChartComponent({
    props,
    watchSources: [() => props.items, () => props.variant, () => props.title, () => props.unit],
    generateOptions: (): EChartsOption => {
      const accent = readScreenColor('--screen-accent', '#6d8cff')
      const accentSoft = readScreenColor('--screen-accent-soft', '#9aaeff')
      const cyan = readScreenColor('--screen-cyan', '#35c7d7')
      const success = readScreenColor('--screen-success', '#2bd49b')
      const warning = readScreenColor('--screen-warning', '#f4b653')
      const danger = readScreenColor('--screen-danger', '#ff6474')
      const strong = readScreenColor('--screen-text-strong', '#f6faff')
      const muted = readScreenColor('--screen-text-muted', '#80a0b9')
      const track = readScreenColor('--screen-chart-track', 'rgba(120, 157, 187, 0.13)')
      const gridLine = readScreenColor('--screen-chart-grid', 'rgba(120, 157, 187, 0.11)')
      const colors = [accent, cyan, success, warning, danger, accentSoft]
      const hasValue =
        total.value > 0 ||
        (props.variant === 'lollipop' && props.items.some((item) => item.value < 0))
      const visibleItems = props.items.length
        ? props.items
        : [{ label: '当前无待处置数据', value: 0, caption: '基线正常', tone: 'success' as const }]
      const captionMap = new Map(props.items.map((item) => [item.label, item.caption ?? '']))
      const tooltip = {
        trigger: 'item' as const,
        backgroundColor: 'rgba(5, 17, 29, 0.96)',
        borderColor: gridLine,
        textStyle: { color: strong, fontSize: 13 },
        formatter: (params: unknown) => {
          if (!params || typeof params !== 'object' || !('name' in params)) return ''
          const name = String(params.name)
          const rawValue = 'value' in params ? params.value : 0
          const value = Array.isArray(rawValue) ? Number(rawValue.at(-1) ?? 0) : Number(rawValue)
          const caption = captionMap.get(name)
          return `${name}<br/><strong>${hasValue ? value : 0}${props.unit}</strong>${caption ? `<br/>${caption}` : ''}`
        }
      }

      if (
        (props.variant === 'donut' || props.variant === 'rose') &&
        props.items.filter((item) => item.value > 0).length > 1
      ) {
        const isDonut = props.variant === 'donut'
        const valueMap = new Map(props.items.map((item) => [item.label, item.value]))
        return {
          title: {
            text: String(hasValue ? total.value : 0),
            subtext: hasValue ? '合计' : '状态正常',
            left: '31%',
            top: '38%',
            textAlign: 'center',
            textStyle: { color: strong, fontSize: 30, fontWeight: 760 },
            subtextStyle: { color: muted, fontSize: 11, lineHeight: 17 }
          },
          tooltip: hasValue ? tooltip : { show: false },
          legend: {
            orient: 'vertical',
            top: 'middle',
            right: '2%',
            width: '40%',
            itemWidth: 8,
            itemHeight: 8,
            itemGap: 10,
            formatter: (name: string) =>
              `{name|${name}}  {value|${valueMap.get(name) ?? 0}${props.unit}}`,
            textStyle: {
              color: muted,
              fontSize: 11,
              rich: {
                name: { color: muted, width: 66, fontSize: 11 },
                value: { color: strong, fontSize: 12, fontWeight: 700 }
              }
            },
            data: props.items.map((item) => item.label)
          },
          series: [
            {
              type: 'pie',
              radius: isDonut ? ['50%', '79%'] : ['20%', '82%'],
              center: ['32%', '50%'],
              roseType: isDonut ? undefined : 'radius',
              minAngle: hasValue ? 4 : 0,
              startAngle: 108,
              silent: !hasValue,
              itemStyle: {
                borderColor: '#07182a',
                borderWidth: hasValue ? 3 : 0,
                borderRadius: isDonut ? 6 : 3
              },
              label: {
                show: false,
                color: strong,
                fontSize: 11,
                formatter: '{b}\n{c}'
              },
              labelLine: { length: 7, length2: 5, lineStyle: { color: gridLine } },
              data: visibleItems.map((item, index) => ({
                name: item.label,
                value: hasValue ? item.value : 1,
                itemStyle: { color: hasValue ? colors[index % colors.length] : track }
              })),
              ...getAnimationConfig(120, 900)
            }
          ]
        }
      }

      if (props.variant === 'radar') {
        const maxValue = Math.max(...props.items.map((item) => item.value), 1)
        return {
          tooltip: hasValue ? tooltip : { show: false },
          radar: {
            center: ['50%', '50%'],
            radius: '80%',
            splitNumber: 4,
            indicator: props.items.map((item) => ({
              name: item.label,
              max: Math.ceil(maxValue * 1.2)
            })),
            axisName: { color: muted, fontSize: 11 },
            axisLine: { lineStyle: { color: gridLine } },
            splitLine: { lineStyle: { color: [gridLine] } },
            splitArea: { areaStyle: { color: ['transparent', 'rgba(109, 140, 255, 0.025)'] } }
          },
          series: [
            {
              type: 'radar',
              data: [
                {
                  value: props.items.map((item) => item.value),
                  name: props.title,
                  symbol: 'circle',
                  symbolSize: 5,
                  lineStyle: { width: 2, color: cyan },
                  itemStyle: { color: accentSoft },
                  areaStyle: {
                    color: new echarts.graphic.RadialGradient(0.5, 0.5, 0.8, [
                      { offset: 0, color: 'rgba(53, 199, 215, 0.34)' },
                      { offset: 1, color: 'rgba(109, 140, 255, 0.06)' }
                    ])
                  }
                }
              ],
              ...getAnimationConfig(140, 1000)
            }
          ]
        }
      }

      if (props.variant === 'treemap') {
        if (visibleItems.length <= 2) {
          return {
            grid: { left: 10, right: 10, top: 18, bottom: 18, containLabel: true },
            tooltip: hasValue ? tooltip : { show: false },
            xAxis: {
              type: 'value',
              show: false,
              max: Math.max(...visibleItems.map((item) => item.value), 1) * 1.24
            },
            yAxis: {
              type: 'category',
              data: visibleItems.map((item) => item.label),
              axisLine: { show: false },
              axisTick: { show: false },
              axisLabel: { show: false }
            },
            series: [
              {
                type: 'bar',
                barWidth: visibleItems.length === 1 ? 28 : 24,
                showBackground: true,
                backgroundStyle: { color: track, borderRadius: 7 },
                itemStyle: {
                  borderRadius: 7,
                  color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                    { offset: 0, color: accent },
                    { offset: 1, color: accentSoft }
                  ])
                },
                label: {
                  show: true,
                  position: 'insideLeft',
                  distance: 14,
                  color: strong,
                  fontSize: 12,
                  fontWeight: 600,
                  formatter: (params: unknown) => {
                    if (!params || typeof params !== 'object' || !('name' in params)) return ''
                    const item = visibleItems.find((entry) => entry.label === String(params.name))
                    return `${String(params.name)}   ${hasValue ? (item?.value ?? 0) : 0}${props.unit}`
                  }
                },
                data: visibleItems.map((item) => (hasValue ? item.value : 1)),
                ...getAnimationConfig(100, 850)
              }
            ]
          }
        }
        return {
          tooltip: hasValue ? tooltip : { show: false },
          series: [
            {
              type: 'treemap',
              roam: false,
              nodeClick: false,
              breadcrumb: { show: false },
              top: 4,
              right: 4,
              bottom: 4,
              left: 4,
              silent: !hasValue,
              label: {
                show: true,
                color: strong,
                fontSize: 12,
                lineHeight: 16,
                formatter: (params: unknown) => {
                  if (!params || typeof params !== 'object' || !('name' in params)) return ''
                  const value = 'value' in params ? Number(params.value) : 0
                  return `${String(params.name)}\n${hasValue ? value : 0}${props.unit}`
                }
              },
              upperLabel: { show: false },
              itemStyle: { borderColor: '#07182a', borderWidth: 3, gapWidth: 3 },
              levels: [
                {
                  color: colors,
                  colorSaturation: [0.48, 0.78],
                  itemStyle: { borderColor: '#07182a', borderWidth: 3, gapWidth: 3 }
                }
              ],
              data: visibleItems.map((item) => ({
                name: item.label,
                value: hasValue ? item.value : 1
              })),
              ...getAnimationConfig(100, 850)
            }
          ]
        }
      }

      if (props.variant === 'graph') {
        const orbitNodes = visibleItems.map((item, index) => ({
          name: item.label,
          value: hasValue ? item.value : 0,
          symbolSize:
            35 + (hasValue ? Math.min(28, (item.value / Math.max(total.value, 1)) * 90) : 0),
          itemStyle: { color: hasValue ? colors[index % colors.length] : track }
        }))
        return {
          tooltip: hasValue ? tooltip : { show: false },
          series: [
            {
              type: 'graph',
              layout: 'circular',
              roam: false,
              left: '7%',
              right: '7%',
              top: '6%',
              bottom: '6%',
              edgeSymbol: ['none', 'circle'],
              edgeSymbolSize: 4,
              lineStyle: { color: accent, width: 1, opacity: 0.34, curveness: 0.16 },
              label: { show: true, color: strong, fontSize: 11, position: 'inside' },
              data: [
                {
                  name: '治理中心',
                  value: hasValue ? total.value : 0,
                  symbolSize: 66,
                  fixed: true,
                  x: 0,
                  y: 0,
                  itemStyle: { color: accent, shadowBlur: 24, shadowColor: `${accent}66` }
                },
                ...orbitNodes
              ],
              links: orbitNodes.map((item) => ({ source: '治理中心', target: item.name })),
              ...getAnimationConfig(90, 1000)
            }
          ]
        }
      }

      if (
        props.variant === 'horizontal-bar' ||
        (props.variant === 'donut' && props.items.filter((item) => item.value > 0).length <= 1)
      ) {
        const toneColors = {
          primary: accent,
          success,
          warning,
          danger,
          info: cyan
        }
        const maxValue = Math.max(...visibleItems.map((item) => item.value), 1)

        return {
          grid: { left: 10, right: 56, top: 12, bottom: 12, containLabel: true },
          tooltip: {
            ...tooltip,
            trigger: 'axis',
            axisPointer: { type: 'shadow' as const }
          },
          xAxis: {
            type: 'value',
            min: 0,
            max: Math.ceil(maxValue * 1.18),
            show: false
          },
          yAxis: {
            type: 'category',
            inverse: true,
            data: visibleItems.map((item) => item.label),
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: {
              color: strong,
              fontSize: 13,
              margin: 14,
              width: 92,
              overflow: 'truncate'
            }
          },
          series: [
            {
              type: 'bar',
              barWidth: visibleItems.length >= 5 ? 14 : 20,
              showBackground: true,
              backgroundStyle: { color: track, borderRadius: 8 },
              itemStyle: {
                borderRadius: [0, 8, 8, 0],
                color: (params: { dataIndex: number }) => {
                  const item = visibleItems[params.dataIndex]
                  return item?.tone
                    ? toneColors[item.tone]
                    : colors[params.dataIndex % colors.length]
                }
              },
              label: {
                show: true,
                position: 'right',
                distance: 8,
                color: strong,
                fontSize: 13,
                fontWeight: 700,
                formatter: `{c}${props.unit}`
              },
              emphasis: { focus: 'series' },
              data: visibleItems.map((item) => item.value),
              ...getAnimationConfig(100, 800)
            }
          ]
        }
      }

      const isLollipop = props.variant === 'lollipop'
      return {
        grid: { left: 6, right: 6, top: 22, bottom: 24, containLabel: true },
        tooltip: {
          ...tooltip,
          trigger: 'axis',
          axisPointer: { type: 'shadow' as const }
        },
        xAxis: {
          type: 'category',
          data: props.items.map((item) => item.label),
          axisLine: { lineStyle: { color: gridLine } },
          axisTick: { show: false },
          axisLabel: { color: muted, fontSize: 11, interval: 0, hideOverlap: true }
        },
        yAxis: {
          type: 'value',
          minInterval: 1,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: muted, fontSize: 10 },
          splitLine: { lineStyle: { color: gridLine, type: 'dashed' } }
        },
        series: [
          {
            type: 'bar',
            barMaxWidth: isLollipop ? 8 : 28,
            showBackground: !isLollipop,
            backgroundStyle: { color: track, borderRadius: 5 },
            itemStyle: {
              borderRadius: isLollipop ? 6 : [5, 5, 1, 1],
              color: new echarts.graphic.LinearGradient(0, 1, 0, 0, [
                { offset: 0, color: accent },
                { offset: 1, color: cyan }
              ])
            },
            label: {
              show: true,
              position: 'top',
              color: strong,
              fontSize: 12,
              fontWeight: 700,
              formatter: `{c}${props.unit}`
            },
            data: props.items.map((item) => ({
              value: item.value,
              itemStyle: item.value < 0 ? { color: danger } : undefined,
              label: item.value < 0 ? { position: 'bottom' as const, offset: [0, -16] } : undefined
            })),
            ...getAnimationConfig(120, 850)
          },
          ...(isLollipop
            ? [
                {
                  type: 'scatter' as const,
                  symbolSize: 13,
                  data: props.items.map((item) => ({
                    value: item.value,
                    itemStyle: {
                      color: item.value < 0 ? danger : cyan,
                      shadowColor: item.value < 0 ? `${danger}88` : `${cyan}88`
                    }
                  })),
                  itemStyle: { shadowBlur: 12 },
                  z: 4,
                  ...getAnimationConfig(240, 850)
                }
              ]
            : [])
        ]
      }
    }
  })
</script>

<style scoped lang="scss">
  .domain-insight-chart,
  .domain-insight-chart__canvas {
    width: 100%;
    height: 100%;
    min-height: 0;
  }
</style>
