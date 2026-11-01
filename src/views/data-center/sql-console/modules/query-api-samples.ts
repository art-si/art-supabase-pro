import { isEqual } from 'lodash-es'
import type { SqlQueryApiDefinition, SqlQueryApiParameter } from '@/types/sql-query-api'

export interface SqlQueryApiSample {
  slug: string
  name: string
  description: string
  sql: string
  parameters: SqlQueryApiParameter[]
  maxRows: number
  timeoutMs: number
  values: Record<string, string | boolean>
  inputHint: string
  outputHint: string
}

/** Self-contained teaching queries: no business tables, writes or live credentials. */
export const sqlQueryApiSamples: readonly SqlQueryApiSample[] = [
  {
    slug: 'demo-hello',
    name: '示例 1：参数问候',
    description:
      '入门示例：传入一个名字，返回问候语。先填入示例参数，再点击调用 API；不读取业务数据。',
    sql: "SELECT '你好，' || CAST(:name AS text) AS message, '你已成功调用查询 API' AS note;",
    parameters: [{ name: 'name', type: 'string', required: true }],
    maxRows: 20,
    timeoutMs: 5000,
    values: { name: '亿企工场' },
    inputHint: 'name = 亿企工场',
    outputHint: '返回 1 行：你好，亿企工场'
  },
  {
    slug: 'demo-order-amount',
    name: '示例 2：订单金额试算',
    description: '数值参数示例：数量乘单价并保留两位小数。只计算传入的演示值，不创建或修改订单。',
    sql: `SELECT CAST(:quantity AS numeric) AS quantity,
       CAST(:unit_price AS numeric) AS unit_price,
       round(CAST(:quantity AS numeric) * CAST(:unit_price AS numeric), 2) AS total_amount;`,
    parameters: [
      { name: 'quantity', type: 'number', required: true },
      { name: 'unit_price', type: 'number', required: true }
    ],
    maxRows: 20,
    timeoutMs: 5000,
    values: { quantity: '3', unit_price: '19.90' },
    inputHint: 'quantity = 3，unit_price = 19.90',
    outputHint: '返回 1 行：total_amount = 59.70'
  },
  {
    slug: 'demo-sales-trend',
    name: '示例 3：7 日销售趋势',
    description:
      '日期与筛选示例：按起始日期生成 7 天模拟销售数据，可按最低金额筛选，结果可用于图表。不是实际经营数据。',
    sql: `SELECT CAST(:start_date AS date) + (day_no - 1) AS sale_date,
       amount AS sales_amount,
       orders AS order_count
FROM (VALUES (1, 1200.00, 12), (2, 1580.00, 15), (3, 980.00, 9),
             (4, 2100.00, 21), (5, 1750.00, 16), (6, 2600.00, 24),
             (7, 1950.00, 17)) AS demo(day_no, amount, orders)
WHERE amount >= CAST(:min_amount AS numeric)
ORDER BY day_no;`,
    parameters: [
      { name: 'start_date', type: 'date', required: true },
      { name: 'min_amount', type: 'number', required: true }
    ],
    maxRows: 20,
    timeoutMs: 5000,
    values: { start_date: '2026-01-01', min_amount: '0' },
    inputHint: 'start_date = 2026-01-01，min_amount = 0',
    outputHint: '返回 7 行模拟数据：日期、销售额、订单数'
  }
]

/** This identifies teaching values only; API authorization always stays on the server. */
export function getSqlQueryApiSample(
  definition: Pick<SqlQueryApiDefinition, 'slug' | 'sql' | 'parameters'>
): SqlQueryApiSample | undefined {
  return sqlQueryApiSamples.find(
    (sample) =>
      isEqual(sample.parameters, definition.parameters) &&
      (definition.sql
        ? definition.sql.trim() === sample.sql.trim()
        : definition.slug === sample.slug)
  )
}
