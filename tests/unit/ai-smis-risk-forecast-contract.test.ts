import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateSmisRiskForecast } from '../../supabase/functions/_shared/ai-smis-risk-forecast-contract.ts'

const asOf = '2026-09-15T00:00:00.000Z'

test('returns low confidence for sparse data and keeps the forecast explainable', () => {
  const result = evaluateSmisRiskForecast({
    asOf,
    lookbackDays: 30,
    observations: [
      {
        status: 'pending_acceptance',
        hazardLevel: 'general_d',
        reportedAt: '2026-09-10T00:00:00.000Z',
        rectificationDeadline: '2026-09-12T00:00:00.000Z'
      }
    ]
  })
  assert.equal(result.confidence, 'low')
  assert.equal(result.currentPeriodCount, 1)
  assert.equal(result.overdueCount, 1)
  assert.equal(result.methodology, 'deterministic_weighted_trend_v1')
})

test('detects an increasing current-period trend', () => {
  const observations = [
    ...Array.from({ length: 6 }, (_, index) => ({
      status: index < 4 ? 'rectifying' : 'completed',
      hazardLevel: index < 2 ? 'general_a' : 'general_c',
      reportedAt: `2026-09-${String(2 + index).padStart(2, '0')}T00:00:00.000Z`
    })),
    ...Array.from({ length: 2 }, (_, index) => ({
      status: 'completed',
      hazardLevel: 'general_d',
      reportedAt: `2026-07-${String(20 + index).padStart(2, '0')}T00:00:00.000Z`
    }))
  ]
  const result = evaluateSmisRiskForecast({ asOf, lookbackDays: 30, observations })
  assert.equal(result.trendPercent, 200)
  assert.equal(result.currentPeriodCount, 6)
  assert.ok(result.score >= 30)
})

test('returns a zero baseline when both periods have no observations', () => {
  const result = evaluateSmisRiskForecast({ asOf, lookbackDays: 30, observations: [] })
  assert.equal(result.score, 0)
  assert.equal(result.riskLevel, 'low')
  assert.equal(result.forecast30DayCount, 0)
})
