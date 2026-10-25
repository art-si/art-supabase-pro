import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extractAiEdgeBearerToken,
  isActiveAiEdgeAppUser
} from '../../supabase/functions/_shared/ai-edge-user-context-policy'

test('extracts bearer tokens without surrounding whitespace', () => {
  assert.equal(extractAiEdgeBearerToken('Bearer valid-token '), 'valid-token')
  assert.equal(extractAiEdgeBearerToken('bearer valid-token'), 'valid-token')
  assert.equal(extractAiEdgeBearerToken('raw-token'), 'raw-token')
})

test('accepts only active tenant-bound application users', () => {
  assert.equal(
    isActiveAiEdgeAppUser({ tenant_id: 'tenant-1', user_email: 'user@example.com', status: '1' }),
    true
  )
  assert.equal(
    isActiveAiEdgeAppUser({ tenant_id: 'tenant-1', user_email: 'user@example.com', status: null }),
    true
  )
  assert.equal(
    isActiveAiEdgeAppUser({ tenant_id: '', user_email: 'user@example.com', status: '1' }),
    false
  )
  assert.equal(
    isActiveAiEdgeAppUser({ tenant_id: 'tenant-1', user_email: 'user@example.com', status: '0' }),
    false
  )
  assert.equal(isActiveAiEdgeAppUser(null), false)
})
