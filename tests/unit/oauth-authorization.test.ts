import assert from 'node:assert/strict'
import test from 'node:test'
import {
  oauthConsentLoginTarget,
  resolveOAuthAuthorizationId,
  resolveOAuthAuthorizationRedirect
} from '../../src/utils/oauth-authorization'

test('OAuth login resumes only the local consent route and retains its request identity', () => {
  const id = 'd2c1c21e-2196-4ff4-97f2-999999999999'
  assert.equal(resolveOAuthAuthorizationId(id), id)
  assert.equal(resolveOAuthAuthorizationId('//evil.example'), undefined)
  assert.equal(resolveOAuthAuthorizationId([id]), undefined)
  assert.deepEqual(oauthConsentLoginTarget(id), {
    path: '/auth/login',
    query: { redirect: `/auth/oauth-consent?authorization_id=${id}` }
  })
})
test('OAuth response rejects script, credential-bearing and relative callback URLs', () => {
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,test',
    '/local',
    'https://user:secret@evil.example/callback'
  ])
    assert.throws(() => resolveOAuthAuthorizationRedirect(value))
  assert.equal(
    resolveOAuthAuthorizationRedirect(
      'http://localhost:3010/api/auth/callback?code=test&state=test'
    ),
    'http://localhost:3010/api/auth/callback?code=test&state=test'
  )
})
