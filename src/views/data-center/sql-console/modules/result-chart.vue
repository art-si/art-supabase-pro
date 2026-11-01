<template>
  <ArtDrawer
    ref="drawer"
    :size="1000"
    :show-confirm-button="false"
    :show-form-focus-button="false"
    :destroy-on-close="false"
    cancel-text="返回结果表"
  >
    <div class="sql-result-chart flex min-w-0 flex-col gap-4">
      <div
        class="flex flex-wrap items-center justify-between gap-2 text-xs text-g-700"
        role="status"
      >
        <span
          >本次已加载 {{ rows.length }} 行 · {{ columns.length }} 列 · 图表不会重新执行 SQL</span
        >
        <span>使用全部原始结果，包含所有本地分页</span>
      </div>
      <ElAlert
        v-if="truncated"
        type="warning"
        title="查询已达到返回上限，图表仅覆盖本次已加载的数据，不能代表数据库全量。"
        :closable="false"
        show-icon
      />
      <ArtForm
        v-model="config"
        :items="formItems"
        label-position="left"
        :label-width="76"
        class="px-0! pt-0!"
      />
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs leading-5 text-g-700">
        <span>{{ semantics }}</span>
        <span>{{ dataset.points.length }} 个数据点</span>
      </div>
      <ElAlert
        v-if="dataset.missingRows || dataset.unsafeRows"
        type="warning"
        :title="exclusionMessage"
        :closable="false"
        show-icon
      />
      <ElTabs v-model="view">
        <ElTabPane label="图表" name="chart">
          <ArtEmptyState
            v-if="dataset.error"
            title="当前配置无法绘图"
            :description="dataset.error"
            size="compact"
          />
          <div
            v-show="!dataset.error"
            ref="chartRef"
            class="h-80 min-w-0 w-full"
            role="img"
            :aria-label="`SQL 结果${kindLabel}，${dataset.points.length} 个数据点；可切换图表数据核对精确值`"
          />
        </ElTabPane>
        <ElTabPane label="图表数据" name="data">
          <div class="h-96 min-w-0">
            <ArtTable
              :data="dataset.points"
              :columns="dataColumns"
              :show-table-header="false"
              height="100%"
              client-pagination
              :pagination="{ current: dataPage, size: dataSize, total: dataset.points.length }"
              :pagination-options="{ pageSizes: [20, 50, 100] }"
              empty-text="暂无可绘制数据"
              border
              @pagination:current-change="dataPage = $event"
              @pagination:size-change="changeDataSize"
            />
          </div>
        </ElTabPane>
      </ElTabs>
      <p class="m-0 text-xs leading-5 text-g-700">
        {{
          dataset.duplicateLabels && config.aggregation === 'rows' && config.kind !== 'scatter'
            ? '同名类别按原始行分别展示，不自动合并。'
            : '图表数据可核对每个数据点的精确十进制值与来源行数。'
        }}
        NULL 和空数值不补零；不能无损转为绘图坐标的数值会排除，原始结果保持完整。
      </p>
    </div>
    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-2">
        <ElButton
          :disabled="Boolean(dataset.error) || !dataset.points.length || view !== 'chart'"
          @click="downloadPng"
        >
          <ArtSvgIcon icon="ri:download-2-line" />下载图表 PNG
        </ElButton>
        <ElButton type="primary" @click="drawer?.handleClose()">返回结果表</ElButton>
      </div>
    </template>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { computed, h, nextTick, ref, watch } from 'vue'
  import { ElMessage } from 'element-plus'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import type { ColumnOption } from '@/types'
  import { useChart, useChartOps } from '@/hooks/core/useChart'
  import type { EChartsOption } from '@/plugins/echarts'
  import { getCssVar } from '@/utils/ui'
  import { downloadBlob } from '@/utils/file'
  import {
    buildSqlChartDataset,
    recommendSqlChart,
    sqlChartFields,
    type SqlChartColumn,
    type SqlChartConfig,
    type SqlChartPoint
  } from './result-chart'

  const props = defineProps<{
    rows: Record<string, unknown>[]
    columns: SqlChartColumn[]
    truncated?: boolean
  }>()
  const drawer = ref<ArtDrawerExpose>()
  const config = ref<SqlChartConfig>(recommendSqlChart(props.rows, props.columns))
  const view = ref('chart')
  const dataPage = ref(1)
  const dataSize = ref(20)
  const changeDataSize = (size: number) => {
    dataSize.value = size
    dataPage.value = 1
  }
  const fields = computed(() => sqlChartFields(props.rows, props.columns))
  const dataset = computed(() => buildSqlChartDataset(props.rows, config.value))
  const labels = { bar: '柱状图', line: '折线图', pie: '饼图', scatter: '散点图' }
  const kindLabel = computed(() => labels[config.value.kind])
  const formItems = computed<FormItem[]>(() => [
    {
      key: 'kind',
      label: '图表类型',
      type: 'segment',
      span: config.value.kind === 'scatter' ? 24 : 12,
      options: Object.entries(labels).map(([value, label]) => ({ value, label })),
      props: { 'aria-label': '结果图表类型' }
    },
    {
      key: 'aggregation',
      label: '数据处理',
      type: 'segment',
      span: 12,
      hidden: config.value.kind === 'scatter',
      options: [
        { label: '逐行展示', value: 'rows' },
        { label: '按类别求和', value: 'sum' },
        { label: '行数统计', value: 'count' }
      ],
      props: { 'aria-label': '图表数据处理' }
    },
    {
      key: 'dimension',
      label: '类别字段',
      type: 'select',
      span: 12,
      hidden: config.value.kind === 'scatter',
      options: [
        { label: config.value.aggregation === 'rows' ? '原始行号' : '全部结果', value: '' },
        ...fields.value.dimensions.map((column) => ({ label: column.name, value: column.name }))
      ],
      props: { filterable: true, 'aria-label': '图表类别字段', emptyValues: [null, undefined] }
    },
    {
      key: 'xMeasure',
      label: 'X 轴数值',
      type: 'select',
      span: 12,
      hidden: config.value.kind !== 'scatter',
      options: fields.value.numeric.map((column) => ({ label: column.name, value: column.name })),
      props: { filterable: true, 'aria-label': '图表 X 轴数值' }
    },
    {
      key: 'measure',
      label: config.value.kind === 'scatter' ? 'Y 轴数值' : '数值字段',
      type: 'select',
      span: 12,
      hidden: config.value.aggregation === 'count' && config.value.kind !== 'scatter',
      options: fields.value.numeric.map((column) => ({ label: column.name, value: column.name })),
      props: { filterable: true, 'aria-label': '图表数值字段' }
    }
  ])
  const semantics = computed(() =>
    config.value.kind === 'scatter'
      ? '每行对应一个点，X / Y 均使用数值坐标'
      : config.value.aggregation === 'rows'
        ? `按查询返回顺序逐行展示${config.value.kind === 'line' ? '，不自动按日期排序' : ''}`
        : config.value.aggregation === 'sum'
          ? '相同类别合并求和，仅计入有效数值行'
          : '相同类别统计原始行数，包含空数值行'
  )
  const exclusionMessage = computed(
    () =>
      [
        dataset.value.missingRows ? `已排除 ${dataset.value.missingRows} 行空数值` : '',
        dataset.value.unsafeRows
          ? `已排除 ${dataset.value.unsafeRows} 行无效或超出绘图精度的数值`
          : ''
      ]
        .filter(Boolean)
        .join('；') + '。可返回结果表查看原始值，或使用行数统计。'
  )
  const dataColumns = computed<ColumnOption<SqlChartPoint>[]>(() => [
    {
      prop: 'label',
      label: config.value.kind === 'scatter' ? '来源行 / 类别' : '类别',
      minWidth: 160,
      showOverflowTooltip: true
    },
    ...(config.value.kind === 'scatter'
      ? [{ prop: 'xExact', label: 'X 精确值', minWidth: 160 }]
      : []),
    {
      prop: 'exact',
      label: config.value.kind === 'scatter' ? 'Y 精确值' : '精确值',
      minWidth: 180,
      formatter: (row) => h('span', { class: 'font-mono text-xs' }, row.exact)
    },
    { prop: 'rowCount', label: '来源行数', width: 100 }
  ])
  const {
    chartRef,
    initChart,
    getChartInstance,
    isDark,
    getAxisLineStyle,
    getAxisLabelStyle,
    getSplitLineStyle,
    getTooltipStyle
  } = useChart({ autoTheme: false })
  const renderChart = async () => {
    await nextTick()
    if (view.value !== 'chart' || dataset.value.error) return
    const points = dataset.value.points
    const axisStyle = {
      axisLine: getAxisLineStyle(),
      axisLabel: { ...getAxisLabelStyle(), hideOverlap: true },
      splitLine: getSplitLineStyle()
    }
    const colors = useChartOps().colors
    const options: EChartsOption = {
      animation: false,
      backgroundColor: getCssVar('--default-box-color'),
      color: colors,
      tooltip: { ...getTooltipStyle('item'), renderMode: 'richText', confine: true },
      grid: {
        top: 24,
        right: 24,
        left: 16,
        bottom: points.length > 20 ? 56 : 24,
        containLabel: true
      },
      ...(config.value.kind === 'pie'
        ? {
            series: [
              {
                type: 'pie',
                radius: ['0%', '65%'],
                avoidLabelOverlap: true,
                data: points.map((point) => ({ name: point.label, value: point.value }))
              }
            ]
          }
        : {
            xAxis:
              config.value.kind === 'scatter'
                ? { type: 'value', name: config.value.xMeasure, ...axisStyle }
                : { type: 'category', data: points.map((point) => point.label), ...axisStyle },
            yAxis: { type: 'value', ...axisStyle },
            dataZoom:
              config.value.kind !== 'scatter' && points.length > 20
                ? [
                    {
                      type: 'slider',
                      height: 18,
                      bottom: 8,
                      start: 0,
                      end: Math.min(100, (30 / points.length) * 100)
                    },
                    { type: 'inside' }
                  ]
                : [],
            series: [
              {
                type: config.value.kind,
                name: config.value.aggregation === 'count' ? '行数' : config.value.measure,
                data:
                  config.value.kind === 'scatter'
                    ? points.map((point) => [point.x ?? 0, point.value])
                    : points.map((point) => point.value),
                ...(config.value.kind === 'line'
                  ? { connectNulls: false, showSymbol: points.length <= 50, smooth: false }
                  : {}),
                ...(config.value.kind === 'bar' ? { barMaxWidth: 48 } : {})
              }
            ]
          })
    }
    getChartInstance()?.clear()
    initChart(options)
  }
  watch([dataset, view, isDark], () => {
    void renderChart()
  })
  watch(dataset, () => {
    dataPage.value = 1
  })
  watch(
    () => [props.rows, props.columns],
    () => {
      config.value = recommendSqlChart(props.rows, props.columns)
      drawer.value?.handleClose()
    }
  )
  const downloadPng = () => {
    const chart = getChartInstance()
    if (!chart) {
      ElMessage.info('图表正在准备，请稍后重试')
      return
    }
    try {
      chart
        .renderToCanvas({ pixelRatio: 2, backgroundColor: getCssVar('--default-box-color') })
        .toBlob((blob) => {
          if (!blob) {
            ElMessage.warning('图表导出失败，请重试')
            return
          }
          downloadBlob(blob, 'SQL查询结果图表.png')
          ElMessage.success('图表已导出，仅包含本次已加载数据')
        }, 'image/png')
    } catch {
      ElMessage.warning('图表导出失败，请重试')
    }
  }
  defineExpose({
    open: () => {
      config.value = recommendSqlChart(props.rows, props.columns)
      view.value = 'chart'
      return drawer.value?.handleOpen(undefined, {
        title: '结果图表',
        subtitle: '选择字段与统计方式，快速分析已加载结果',
        headerIcon: 'ri:bar-chart-line',
        onOpen: () => {
          void renderChart()
        }
      })
    }
  })
</script>
