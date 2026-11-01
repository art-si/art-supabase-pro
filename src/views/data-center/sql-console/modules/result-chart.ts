import Decimal from 'decimal.js-light'
import { countBy, groupBy } from 'lodash-es'
import { getOwnRecordValue } from '@/utils/record'

export type SqlChartKind = 'bar' | 'line' | 'pie' | 'scatter'
export type SqlChartAggregation = 'rows' | 'sum' | 'count'
export interface SqlChartColumn {
  name: string
  type?: string | null
}
export interface SqlChartConfig {
  kind: SqlChartKind
  dimension: string
  measure: string
  xMeasure: string
  aggregation: SqlChartAggregation
}
export interface SqlChartPoint {
  label: string
  value: number
  exact: string
  x?: number
  xExact?: string
  rowCount: number
}
export interface SqlChartDataset {
  points: SqlChartPoint[]
  missingRows: number
  unsafeRows: number
  duplicateLabels: boolean
  error: string
}

// Up to 1,000 loaded rows, each with at most 256 numeric characters. This keeps
// decimal summation exact before checking whether the chart can represent it.
const ChartDecimal = Decimal.clone({ precision: 1024 })
const numericLiteral = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
const numericType =
  /^(?:smallint|integer|int\d*|bigint|tinyint|mediumint|decimal|numeric|number|float\d*|double|real|dec|binary_float|binary_double)(?:\b|\()/i

/** Chart coordinates must round-trip without silently rounding database text. */
export function sqlChartNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  const raw = String(value).trim()
  if (!raw || raw.length > 256 || !numericLiteral.test(raw)) return undefined
  const number = Number(raw)
  if (!Number.isFinite(number) || Math.abs(number) > Number.MAX_SAFE_INTEGER) return undefined
  try {
    return new ChartDecimal(raw).eq(new ChartDecimal(String(number))) ? number : undefined
  } catch {
    return undefined
  }
}

export function sqlChartFields(rows: Record<string, unknown>[], columns: SqlChartColumn[]) {
  const numeric = columns.filter((column) => {
    if (numericType.test(column.type || '')) return true
    const values = rows
      .map((row) => getOwnRecordValue(row, column.name))
      .filter((value) => value != null && value !== '')
    return (
      values.length > 0 &&
      values.every(
        (value) =>
          (typeof value === 'number' || typeof value === 'string') &&
          numericLiteral.test(String(value).trim())
      )
    )
  })
  const dimensions = columns.filter((column) =>
    rows.every((row) => {
      const value = getOwnRecordValue(row, column.name)
      return value == null || ['string', 'number', 'boolean'].includes(typeof value)
    })
  )
  return { numeric, dimensions }
}

export function recommendSqlChart(
  rows: Record<string, unknown>[],
  columns: SqlChartColumn[]
): SqlChartConfig {
  const fields = sqlChartFields(rows, columns)
  const category = fields.dimensions.find((column) => !fields.numeric.includes(column))
  const measures = fields.numeric.filter((column) =>
    rows.some((row) => sqlChartNumber(getOwnRecordValue(row, column.name)) !== undefined)
  )
  const measure =
    measures.find((column) => !/(?:^id$|_id$)/i.test(column.name)) ||
    measures[0] ||
    fields.numeric[0]
  const dateLike =
    category &&
    rows.some(
      (row) =>
        typeof getOwnRecordValue(row, category.name) === 'string' &&
        /^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(String(getOwnRecordValue(row, category.name)))
    )
  return {
    kind: !category && fields.numeric.length > 1 ? 'scatter' : dateLike ? 'line' : 'bar',
    dimension: category?.name || '',
    measure: (!category && fields.numeric.length > 1 ? fields.numeric[1] : measure)?.name || '',
    xMeasure: fields.numeric[0]?.name || '',
    aggregation: fields.numeric.length ? 'rows' : 'count'
  }
}

const categoryLabel = (value: unknown): string =>
  value == null ? '（NULL）' : value === '' ? '（空字符串）' : String(value)

/** Uses all loaded original rows; page/search/edit state is deliberately absent. */
export function buildSqlChartDataset(
  rows: Record<string, unknown>[],
  config: SqlChartConfig
): SqlChartDataset {
  const result: SqlChartDataset = {
    points: [],
    missingRows: 0,
    unsafeRows: 0,
    duplicateLabels: false,
    error: ''
  }
  if (!rows.length) return { ...result, error: '暂无已加载结果，请先执行查询' }
  if (config.kind === 'scatter' && (!config.xMeasure || !config.measure))
    return { ...result, error: '散点图需要选择两个数值字段' }
  if (config.aggregation !== 'count' && !config.measure)
    return { ...result, error: '请选择数值字段，或切换为行数统计' }
  const entries = rows.flatMap((row, index) => {
    const raw = getOwnRecordValue(row, config.measure)
    const xRaw = getOwnRecordValue(row, config.xMeasure)
    const scatter = config.kind === 'scatter'
    const missing =
      (config.aggregation !== 'count' || scatter) &&
      (raw == null || raw === '' || (scatter && (xRaw == null || xRaw === '')))
    if (missing) {
      result.missingRows++
      return []
    }
    const value = config.aggregation === 'count' && !scatter ? 1 : sqlChartNumber(raw)
    const x = scatter ? sqlChartNumber(xRaw) : undefined
    if (value === undefined || (scatter && x === undefined)) {
      result.unsafeRows++
      return []
    }
    const category = config.dimension ? getOwnRecordValue(row, config.dimension) : index + 1
    return [
      {
        key: config.dimension
          ? JSON.stringify([typeof category, category])
          : config.aggregation === 'rows' || scatter
            ? String(index)
            : 'all',
        label: config.dimension
          ? categoryLabel(category)
          : config.aggregation === 'rows' || scatter
            ? `第 ${index + 1} 行`
            : '全部结果',
        value,
        exact: config.aggregation === 'count' && !scatter ? '1' : String(raw),
        x,
        xExact: scatter ? String(xRaw) : undefined,
        rowCount: 1
      }
    ]
  })
  if (config.kind === 'scatter' || config.aggregation === 'rows') result.points = entries
  else {
    result.points = Object.values(groupBy(entries, 'key')).flatMap((group) => {
      const exact =
        config.aggregation === 'count'
          ? String(group.length)
          : group.reduce((sum, point) => sum.plus(point.exact), new ChartDecimal(0)).toString()
      const value = sqlChartNumber(exact)
      if (value === undefined) {
        result.unsafeRows += group.length
        return []
      }
      return [{ label: group[0].label, value, exact, rowCount: group.length }]
    })
  }
  result.duplicateLabels = Object.values(countBy(result.points, 'label')).some((count) => count > 1)
  if (!result.points.length) result.error = '没有可绘制的数值；请换一个字段或使用行数统计'
  else if (config.kind === 'pie') {
    if (result.duplicateLabels) result.error = '饼图类别重复，请选择按维度求和或行数统计'
    else if (result.points.length > 30)
      result.error = '饼图最多展示 30 个类别，请先在 SQL 中汇总或改用柱状图'
    else if (result.points.some((point) => point.value < 0))
      result.error = '饼图不支持负值，请改用柱状图或折线图'
    else if (result.points.every((point) => point.value === 0))
      result.error = '全部数值为 0，无法计算饼图占比'
  }
  return result
}
