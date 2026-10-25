import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMonthlyPerformance } from '../../modules/art-supabase-tms/src/api/modules/monthly-performance'
import type { MonthlyPlans } from '../../modules/art-supabase-tms/src/api/modules/monthly-plan'

const plans: MonthlyPlans = {
  metrics: [
    {
      code: 'revenue',
      label: '营业收入',
      category: '订单业务',
      unit: '元',
      lower_is_better: false,
      minimum: 0,
      maximum: null,
      sort: 1
    }
  ],
  records: [
    {
      id: 'plan',
      tenant_id: 'own',
      month: '2026-10-01',
      metric_code: 'revenue',
      budget: 80000,
      target: 100000,
      remark: '',
      revision: 1
    }
  ]
}
test('unfinished month is tracked without declaring a missed monthly target', () => {
  const [row] = buildMonthlyPerformance({
    plans,
    actual: { revenue: 70370.25 },
    year: { revenue: 505964.99 },
    tenantId: 'own',
    closedMonth: false
  })
  assert.equal(row.difference, -9629.75)
  assert.equal(row.warning, '跟踪中')
  assert.equal(row.year, 505964.99)
})
test('missing actuals and another tenant plan never become zero or comparable', () => {
  const [missing] = buildMonthlyPerformance({
    plans,
    actual: {},
    year: {},
    tenantId: 'own',
    closedMonth: true
  })
  assert.equal(missing.actual, null)
  assert.equal(missing.difference, null)
  assert.equal(missing.warning, '待核算')
  const [foreign] = buildMonthlyPerformance({
    plans,
    actual: { revenue: 1 },
    year: {},
    tenantId: 'other',
    closedMonth: true
  })
  assert.equal(foreign.budget, null)
  assert.equal(foreign.target, null)
  const [all] = buildMonthlyPerformance({
    plans,
    actual: { revenue: 1 },
    year: {},
    tenantId: null,
    closedMonth: true
  })
  assert.equal(all.difference, null)
  assert.equal(all.warning, '请按租户对比')
})
test('zero budgets and upper-bound targets preserve their meaning', () => {
  const expensePlans = {
    metrics: [{ ...plans.metrics[0], lower_is_better: true }],
    records: [{ ...plans.records[0], budget: 0, target: 100 }]
  }
  const [row] = buildMonthlyPerformance({
    plans: expensePlans,
    actual: { revenue: 90 },
    year: {},
    tenantId: 'own',
    closedMonth: true
  })
  assert.equal(row.difference, 90)
  assert.equal(row.warning, '达标')
  const [failed] = buildMonthlyPerformance({
    plans: expensePlans,
    actual: { revenue: 110 },
    year: {},
    tenantId: 'own',
    closedMonth: true
  })
  assert.equal(failed.warning, '未达标')
})
