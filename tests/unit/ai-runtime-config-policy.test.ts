import assert from 'node:assert/strict'
import test from 'node:test'
import {
  disableAiRuntimeConfig,
  normalizeAiInteger,
  resolveAiConfigTenantScope,
  type AiRuntimeConfig
} from '../../supabase/functions/_shared/ai-runtime-config-policy'

const defaults: AiRuntimeConfig = {
  enabled: true,
  provider: 'openai_compatible',
  model: 'model-a',
  visionModel: 'vision-a',
  fallbackModel: null,
  timeoutMs: 60000,
  maxRetries: 0,
  temperature: 0,
  maxTokens: 1400,
  rateLimitPerMinute: 6,
  rateLimitPerDay: 100,
  promptVersion: 'v1'
}

test('AI integer normalization preserves finite coercion and truncates toward zero', () => {
  const cases: Array<[unknown, number]> = [
    [null, 0],
    ['', 0],
    ['  ', 0],
    [false, 0],
    [true, 1],
    [[], 0],
    [[2], 2],
    [0, 0],
    ['12.9', 12],
    [-12.9, -12],
    ['-12.9', -12],
    ['1e2', 100]
  ]
  for (const [input, expected] of cases) {
    assert.equal(normalizeAiInteger(input, 7, -100, 100), expected)
  }
})

test('AI integer normalization uses the unchanged fallback for non-finite inputs', () => {
  for (const input of [undefined, NaN, Infinity, -Infinity, 'invalid', '1,000', {}]) {
    assert.equal(normalizeAiInteger(input, 30, 1, 50), 30)
    assert.equal(normalizeAiInteger(input, 0, 1, 50), 0)
  }
})

test('AI integer limits remain caller-owned for timeout, retries and query windows', () => {
  assert.equal(normalizeAiInteger('1', 60_000, 10_000, 120_000), 10_000)
  assert.equal(normalizeAiInteger('120001', 60_000, 10_000, 120_000), 120_000)
  assert.equal(normalizeAiInteger(undefined, 60_000, 10_000, 120_000), 60_000)
  assert.equal(normalizeAiInteger('-1', 0, 0, 2), 0)
  assert.equal(normalizeAiInteger('2.9', 0, 0, 2), 2)
  assert.equal(normalizeAiInteger('6', 30, 7, 90), 7)
  assert.equal(normalizeAiInteger('91', 30, 7, 90), 90)
  assert.equal(normalizeAiInteger('8.9', 30, 7, 90), 8)
})

test('missing AI governance disables the feature without mutating provider defaults', () => {
  const result = disableAiRuntimeConfig(defaults)

  assert.equal(result.enabled, false)
  assert.equal(result.model, defaults.model)
  assert.equal(result.visionModel, defaults.visionModel)
  assert.equal(defaults.enabled, true)
  assert.notEqual(result, defaults)
})

test('ordinary tenants inherit platform AI configuration after their tenant override', () => {
  assert.deepEqual(resolveAiConfigTenantScope('tenant-a', 'platform-tenant'), [
    'tenant-a',
    'platform-tenant'
  ])
})

test('platform tenant reads only its own AI configuration', () => {
  assert.deepEqual(resolveAiConfigTenantScope('platform-tenant', 'platform-tenant'), [
    'platform-tenant'
  ])
})
