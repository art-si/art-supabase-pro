import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  normalizeCloudBasePhone,
  normalizeCloudBaseUserName
} from '../../scripts/migrate-cloudbase-users'

test('keeps valid unique usernames and creates stable UUID fallbacks', () => {
  const used = new Set<string>()
  assert.equal(normalizeCloudBaseUserName('alice.test', 'ignored', used), 'alice.test')
  assert.equal(
    normalizeCloudBaseUserName('中文用户', '12345678-1234-1234-1234-123456789abc', used),
    'user_123456781234123412'
  )
  assert.equal(normalizeCloudBaseUserName('alice.test', 'ignored', used), 'alice.test_1')
})

test('only migrates mainland mobile numbers accepted by CloudBase', () => {
  assert.equal(normalizeCloudBasePhone('138 0013 8000'), '13800138000')
  assert.equal(normalizeCloudBasePhone('+1 555 0100'), null)
})
