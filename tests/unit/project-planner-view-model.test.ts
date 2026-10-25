import assert from 'node:assert/strict'
import test from 'node:test'
import type { AiProjectSuggestion, AiSuggestionBatch } from '../../src/types/ai-project-planner'
import {
  ALL_BATCHES,
  LATEST_BATCH,
  countProjectPlannerStatuses,
  createProjectPlannerBatchView,
  createProjectPlannerFilters,
  createProjectPlannerMetrics,
  filterAndSortProjectSuggestions,
  formatProjectPlannerTime,
  getProjectPlannerPrioritySuggestion,
  hasProjectPlannerActiveFilters
} from '../../src/views/system/ai-project-planner/modules/project-planner-view-model'

test('planner timestamps share minute precision and do not display invalid dates', () => {
  assert.equal(formatProjectPlannerTime('2026-10-08 08:30:59'), '2026-10-08 08:30')
  assert.equal(formatProjectPlannerTime('invalid'), '—')
  assert.equal(formatProjectPlannerTime(''), '—')
  assert.equal(formatProjectPlannerTime(null), '—')
})

function suggestion(id: string, patch: Partial<AiProjectSuggestion> = {}): AiProjectSuggestion {
  return {
    id,
    batchId: 'batch-1',
    category: 'quality',
    title: `建议 ${id}`,
    summary: '提升项目质量',
    evidence: [{ path: 'src/example.ts', fact: '存在重复实现' }],
    whyNow: '当前适合治理',
    impact: 3,
    effort: 'medium',
    confidence: 0.8,
    risk: '需要回归验证',
    prompt: '执行质量改造',
    acceptanceCriteria: ['测试通过'],
    status: 'active',
    rankScore: 60,
    position: 1,
    feedback: { sentiment: 0, copied: 0, expanded: 0 },
    acceptedAt: null,
    completedAt: null,
    dismissedAt: null,
    createTime: '2026-08-01T00:00:00.000Z',
    updateTime: '2026-08-01T00:00:00.000Z',
    ...patch
  }
}

function batch(id: string, createTime: string): AiSuggestionBatch {
  return {
    id,
    snapshotId: 'snapshot-1',
    focus: 'balanced',
    effort: 'mixed',
    status: 'succeeded',
    model: 'test-model',
    promptVersion: 'v1',
    preferenceSummary: {
      totalSignals: 0,
      categoryScores: {
        product: 0,
        business: 0,
        ui_ux: 0,
        security: 0,
        performance: 0,
        quality: 0,
        developer_experience: 0
      },
      preferredCategories: [],
      avoidedCategories: []
    },
    suggestionCount: 0,
    errorMessage: null,
    finishedAt: createTime,
    createTime
  }
}

test('planner filters search evidence and apply structured filters together', () => {
  const filters = createProjectPlannerFilters()
  Object.assign(filters, { keyword: 'RLS', category: 'security', status: 'active' } as const)
  const result = filterAndSortProjectSuggestions(
    [
      suggestion('security', {
        category: 'security',
        evidence: [{ path: 'supabase/policies.sql', fact: 'RLS policy needs review' }]
      }),
      suggestion('completed', {
        category: 'security',
        status: 'completed',
        evidence: [{ path: 'supabase/policies.sql', fact: 'RLS review completed' }]
      }),
      suggestion('quality')
    ],
    filters
  )

  assert.deepEqual(
    result.map((item) => item.id),
    ['security']
  )
})

test('quick-win ordering balances impact, effort and confidence', () => {
  const filters = createProjectPlannerFilters()
  filters.sort = 'quick_win'
  const result = filterAndSortProjectSuggestions(
    [
      suggestion('large', { impact: 5, effort: 'large', confidence: 0.9, rankScore: 90 }),
      suggestion('small', { impact: 4, effort: 'small', confidence: 0.8, rankScore: 70 }),
      suggestion('medium', { impact: 4, effort: 'medium', confidence: 0.9, rankScore: 80 })
    ],
    filters
  )

  assert.deepEqual(
    result.map((item) => item.id),
    ['small', 'medium', 'large']
  )
})

test('active-filter detection includes historical batch selection and resets cleanly', () => {
  const filters = createProjectPlannerFilters()
  assert.equal(hasProjectPlannerActiveFilters(filters), false)
  filters.batchId = ALL_BATCHES
  assert.equal(hasProjectPlannerActiveFilters(filters), true)
  Object.assign(filters, createProjectPlannerFilters())
  assert.equal(hasProjectPlannerActiveFilters(filters), false)
})

test('batch view falls back to the newest available suggestions when the latest batch is empty', () => {
  const suggestions = [
    suggestion('new-1', {
      batchId: 'batch-new',
      createTime: '2026-08-02T08:00:00.000Z'
    }),
    suggestion('new-2', {
      batchId: 'batch-new',
      createTime: '2026-08-02T08:00:00.000Z'
    }),
    suggestion('old-1', {
      batchId: 'batch-old',
      createTime: '2026-08-01T08:00:00.000Z'
    })
  ]
  const state = {
    latestBatch: batch('batch-empty', '2026-08-03T08:00:00.000Z'),
    suggestions
  }

  const latest = createProjectPlannerBatchView(state, LATEST_BATCH)
  const historical = createProjectPlannerBatchView(state, 'batch-old')
  const all = createProjectPlannerBatchView(state, ALL_BATCHES)

  assert.equal(latest.latestBatchHasSuggestions, false)
  assert.deepEqual(
    latest.scopedSuggestions.map((item) => item.id),
    ['new-1', 'new-2']
  )
  assert.match(latest.batchOptions[0].label, /^最新可用批次/)
  assert.deepEqual(
    historical.scopedSuggestions.map((item) => item.id),
    ['old-1']
  )
  assert.equal(all.scopedSuggestions.length, 3)
})

test('planner summary counts the scoped statuses and selects the strongest active priority', () => {
  const suggestions = [
    suggestion('accepted', { status: 'accepted', impact: 5, rankScore: 100 }),
    suggestion('priority', { status: 'active', impact: 4, confidence: 0.95, rankScore: 90 }),
    suggestion('secondary', { status: 'active', impact: 5, confidence: 0.9, rankScore: 80 }),
    suggestion('completed', { status: 'completed' })
  ]
  const statusCounts = countProjectPlannerStatuses(suggestions)
  const metrics = createProjectPlannerMetrics(statusCounts, 7, '当前偏好：质量治理')

  assert.deepEqual(statusCounts, {
    active: 2,
    accepted: 1,
    completed: 1,
    dismissed: 0,
    expired: 0
  })
  assert.equal(getProjectPlannerPrioritySuggestion(suggestions)?.id, 'priority')
  assert.deepEqual(
    metrics.map((metric) => metric.value),
    ['2', '1', '1', '7']
  )
  assert.equal(metrics[3].hint, '当前偏好：质量治理')
})
