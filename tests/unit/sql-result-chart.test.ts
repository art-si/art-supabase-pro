import assert from 'node:assert/strict'
import test from 'node:test'
import { reactive } from 'vue'
import {
  buildSqlChartDataset,
  recommendSqlChart,
  sqlChartFields,
  sqlChartNumber,
  type SqlChartConfig
} from '../../src/views/data-center/sql-console/modules/result-chart'

const config: SqlChartConfig = {
  kind: 'bar',
  dimension: 'region',
  measure: 'amount',
  xMeasure: 'count',
  aggregation: 'rows'
}

test('chart numbers reject silent rounding, overflow, non-numeric and missing values', () => {
  for (const value of [
    null,
    undefined,
    '',
    ' ',
    true,
    {},
    '2026-10-30',
    'Infinity',
    NaN,
    Infinity,
    '1e309',
    '1e-999',
    '9007199254740993',
    '0.1234567890123456789',
    9007199254740992
  ])
    assert.equal(sqlChartNumber(value), undefined, String(value))
  for (const [raw, expected] of [
    ['0.1', 0.1],
    ['123.4500', 123.45],
    ['1e3', 1000],
    ['-5.25', -5.25],
    [0, 0],
    ['0.000000001', 1e-9]
  ] as const)
    assert.equal(sqlChartNumber(raw), expected)
})

test('recommendations use category and date fields or two numeric coordinates', () => {
  const rows = [{ month: '2026-10-30', amount: '12.5', payload: { deep: 1 } }]
  const columns = [
    { name: 'month', type: 'date' },
    { name: 'amount', type: 'numeric' },
    { name: 'payload', type: 'jsonb' }
  ]
  assert.equal(recommendSqlChart(rows, columns).kind, 'line')
  assert.equal(recommendSqlChart(rows, columns).measure, 'amount')
  assert.deepEqual(
    sqlChartFields(rows, columns).dimensions.map((column) => column.name),
    ['month', 'amount']
  )
  assert.equal(recommendSqlChart([{ x: 1, y: 2 }], [{ name: 'x' }, { name: 'y' }]).kind, 'scatter')
  assert.equal(recommendSqlChart([{ label: 'A' }], [{ name: 'label' }]).aggregation, 'count')
})

test('row charts retain query order, zero and negatives while reporting excluded precision and NULLs', () => {
  const rows = [
    { region: '东', amount: '0' },
    { region: '东', amount: '-2.5' },
    { region: '西', amount: null },
    { region: '北', amount: '0.1234567890123456789' }
  ]
  const result = buildSqlChartDataset(rows, config)
  assert.deepEqual(
    result.points.map((point) => [point.label, point.value, point.exact]),
    [
      ['东', 0, '0'],
      ['东', -2.5, '-2.5']
    ]
  )
  assert.equal(result.missingRows, 1)
  assert.equal(result.unsafeRows, 1)
  assert.equal(result.duplicateLabels, true)
  assert.deepEqual(rows[3], { region: '北', amount: '0.1234567890123456789' })
})

test('explicit sums use exact decimal arithmetic and counts include empty measure rows', () => {
  const rows = [
    { region: '东', amount: '0.1' },
    { region: '东', amount: '0.2' },
    { region: '东', amount: null },
    { region: null, amount: '2' }
  ]
  const sum = buildSqlChartDataset(rows, { ...config, aggregation: 'sum' })
  assert.deepEqual(sum.points, [
    { label: '东', value: 0.3, exact: '0.3', rowCount: 2 },
    { label: '（NULL）', value: 2, exact: '2', rowCount: 1 }
  ])
  const count = buildSqlChartDataset(rows, { ...config, aggregation: 'count' })
  assert.equal(count.points[0].value, 3)
  assert.equal(count.missingRows, 0)
  assert.equal(
    buildSqlChartDataset(rows, { ...config, aggregation: 'count', dimension: '' }).points[0].value,
    4
  )
})

test('an aggregate that exceeds safe chart precision is excluded with source-row accounting', () => {
  const result = buildSqlChartDataset(
    [
      { region: 'A', amount: '9007199254740991' },
      { region: 'A', amount: '1' }
    ],
    { ...config, aggregation: 'sum' }
  )
  assert.equal(result.points.length, 0)
  assert.equal(result.unsafeRows, 2)
  assert.ok(result.error)
})

test('pie charts reject duplicate labels, negatives, zero totals and excessive categories', () => {
  const pie = { ...config, kind: 'pie' as const }
  assert.match(
    buildSqlChartDataset(
      [
        { region: 'A', amount: 1 },
        { region: 'A', amount: 2 }
      ],
      pie
    ).error,
    /类别重复/
  )
  assert.equal(
    buildSqlChartDataset(
      [
        { region: 'A', amount: 1 },
        { region: 'A', amount: 2 }
      ],
      { ...pie, aggregation: 'sum' }
    ).error,
    ''
  )
  assert.match(buildSqlChartDataset([{ region: 'A', amount: -1 }], pie).error, /负值/)
  assert.match(buildSqlChartDataset([{ region: 'A', amount: 0 }], pie).error, /全部数值为 0/)
  assert.match(
    buildSqlChartDataset(
      Array.from({ length: 31 }, (_, index) => ({ region: index, amount: 1 })),
      pie
    ).error,
    /30 个类别/
  )
})

test('scatter preserves pairs and excludes a row if either coordinate is unsafe or missing', () => {
  const result = buildSqlChartDataset(
    [
      { count: '1.5', amount: '2.00' },
      { count: null, amount: 3 },
      { count: '9007199254740993', amount: 4 }
    ],
    { ...config, kind: 'scatter', aggregation: 'count' }
  )
  assert.deepEqual(result.points[0], {
    key: '["undefined",null]',
    label: '（NULL）',
    value: 2,
    exact: '2.00',
    x: 1.5,
    xExact: '1.5',
    rowCount: 1
  })
  assert.equal(result.missingRows, 1)
  assert.equal(result.unsafeRows, 1)
})

test('reactive reserved dimensions and measures preserve chart recommendations and exact aggregates', () => {
  const rows = [
    { hasOwnProperty: '东', __v_isReactive: '0.1' },
    { hasOwnProperty: '东', __v_isReactive: '0.2' },
    { hasOwnProperty: '西', __v_isReactive: '1.5' }
  ].map((row) => reactive<Record<string, unknown>>(row))
  assert.equal(typeof rows[0].hasOwnProperty, 'function')
  assert.equal(rows[0].__v_isReactive, true)
  const columns = [{ name: 'hasOwnProperty' }, { name: '__v_isReactive' }]
  const fields = sqlChartFields(rows, columns)
  assert.deepEqual(
    fields.numeric.map(({ name }) => name),
    ['__v_isReactive']
  )
  assert.deepEqual(
    fields.dimensions.map(({ name }) => name),
    ['hasOwnProperty', '__v_isReactive']
  )
  const recommendation = recommendSqlChart(rows, columns)
  assert.deepEqual(recommendation, {
    kind: 'bar',
    dimension: 'hasOwnProperty',
    measure: '__v_isReactive',
    xMeasure: '__v_isReactive',
    aggregation: 'rows'
  })
  const result = buildSqlChartDataset(rows, { ...recommendation, aggregation: 'sum' })
  assert.deepEqual(result.points, [
    { label: '东', value: 0.3, exact: '0.3', rowCount: 2 },
    { label: '西', value: 1.5, exact: '1.5', rowCount: 1 }
  ])
  assert.equal(result.missingRows, 0)
  assert.equal(result.unsafeRows, 0)
  assert.equal(result.error, '')

  const dates = [
    { __v_isReactive: '2026-10-30', hasOwnProperty: '0.1' },
    { __v_isReactive: '2026-10-30', hasOwnProperty: '0.2' }
  ].map((row) => reactive<Record<string, unknown>>(row))
  const dateRecommendation = recommendSqlChart(dates, columns.toReversed())
  assert.equal(dateRecommendation.kind, 'line')
  assert.equal(dateRecommendation.dimension, '__v_isReactive')
  assert.equal(dateRecommendation.measure, 'hasOwnProperty')
  assert.deepEqual(
    buildSqlChartDataset(dates, { ...dateRecommendation, aggregation: 'sum' }).points,
    [{ label: '2026-10-30', value: 0.3, exact: '0.3', rowCount: 2 }]
  )
})

test('chart discovery and aggregation ignore inherited fields without invoking their getters', () => {
  const inherited: Record<string, unknown> = Object.create({
    get hasOwnProperty() {
      assert.fail('inherited category must not be read')
    },
    get constructor() {
      assert.fail('inherited measure must not be read')
    }
  })
  inherited.amount = '0.25'
  assert.deepEqual(sqlChartFields([inherited], [{ name: 'constructor' }]).numeric, [])
  assert.equal(
    recommendSqlChart([inherited], [{ name: 'hasOwnProperty' }, { name: 'constructor' }])
      .aggregation,
    'count'
  )
  assert.deepEqual(
    buildSqlChartDataset([inherited], {
      ...config,
      dimension: 'hasOwnProperty',
      aggregation: 'sum'
    }).points,
    [{ label: '（NULL）', value: 0.25, exact: '0.25', rowCount: 1 }]
  )
  const missing = buildSqlChartDataset([inherited], { ...config, measure: 'constructor' })
  assert.deepEqual(missing.points, [])
  assert.equal(missing.missingRows, 1)
  assert.equal(missing.unsafeRows, 0)
})
