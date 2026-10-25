import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compareAiSmisHazardPayloads,
  normalizeAiSmisHazardResponse,
  validateAiSmisHazardPayload
} from '../../supabase/functions/_shared/ai-smis-hazard-analysis-contract'

test('normalizes SMIS hazard analysis without accepting unsupported levels', () => {
  const result = normalizeAiSmisHazardResponse({
    rawText: ' 配电箱\n禁止合闸 ',
    summary: '发现配电箱周边存在杂物。',
    confidence: 1.4,
    fieldConfidence: { description: 0.91, hazardLevel: -1 },
    warnings: ['需人工复核', '需人工复核'],
    observedHazards: ['通道堆放杂物', '通道堆放杂物'],
    evidence: ['配电箱前方有纸箱'],
    hazard: {
      description: '配电箱前方堆放纸箱，影响安全操作空间。',
      hazardLevel: 'unsupported',
      rectificationSuggestion: '立即移除杂物并保持安全距离。'
    }
  })

  assert.equal(result.confidence, 1)
  assert.equal(result.hazard.hazardLevel, null)
  assert.deepEqual(result.missingFields, ['隐患级别'])
  assert.deepEqual(result.warnings, ['需人工复核'])
  assert.deepEqual(result.observedHazards, ['通道堆放杂物'])
})

test('validates the strict hazard response contract', () => {
  assert.equal(
    validateAiSmisHazardPayload({
      confidence: 0.8,
      fieldConfidence: {},
      hazard: { hazardLevel: 'general_b' }
    }).valid,
    true
  )
  assert.equal(
    validateAiSmisHazardPayload({
      confidence: 0.8,
      fieldConfidence: {},
      hazard: { hazardLevel: 'critical' }
    }).valid,
    false
  )
})

test('flags major-hazard suggestions and compares reviewed fields', () => {
  const result = normalizeAiSmisHazardResponse({
    confidence: 0.7,
    fieldConfidence: {},
    warnings: [],
    hazard: {
      description: '安全出口被完全封堵。',
      hazardLevel: 'major',
      rectificationSuggestion: '立即清理并设置警戒。'
    }
  })
  assert.match(result.warnings[0], /重大隐患/)

  assert.deepEqual(
    compareAiSmisHazardPayloads(result.hazard, {
      description: '安全出口被完全封堵。',
      hazardLevel: 'general_a',
      rectificationSuggestion: '立即清理并设置警戒。'
    }),
    {
      acceptedFields: ['description', 'rectificationSuggestion'],
      correctedFields: ['hazardLevel']
    }
  )
})
