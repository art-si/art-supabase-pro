import assert from 'node:assert/strict'
import test from 'node:test'
import {
  oauthConsentLoginTarget,
  resolveOAuthAuthorizationId,
  resolveOAuthAuthorizationRedirect,
  isFirstPartyOAuthAuthorization,
  resolveSsoAuthorizationId
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

test('internal SSO trusts registered clients/scopes and supports deployment callbacks validated by Auth', () => {
  const policy = [
    {
      clientId: 'internal-bff',
      scopes: ['email', 'profile']
    }
  ]
  const details = {
    client: { id: 'internal-bff', name: 'BFF' },
    redirect_uri: 'http://localhost:3010/api/auth/callback',
    scope: 'email profile'
  }
  assert.equal(isFirstPartyOAuthAuthorization(details, policy), true)
  assert.equal(
    isFirstPartyOAuthAuthorization(
      { ...details, client: { ...details.client, id: 'other' } },
      policy
    ),
    false
  )
  assert.equal(
    isFirstPartyOAuthAuthorization(
      { ...details, redirect_uri: 'https://bff.example.com/api/auth/callback' },
      policy
    ),
    true
  )
  for (const redirect_uri of [
    'http://bff.example.com/api/auth/callback',
    'javascript:alert(1)',
    'https://user:secret@example.com/callback'
  ])
    assert.equal(isFirstPartyOAuthAuthorization({ ...details, redirect_uri }, policy), false)
  assert.equal(
    isFirstPartyOAuthAuthorization({ ...details, scope: 'email profile phone' }, policy),
    false
  )
  assert.equal(isFirstPartyOAuthAuthorization({ ...details, scope: '' }, policy), false)
})

test('SSO request survives an external provider callback without accepting an external resume URL', () => {
  assert.equal(resolveSsoAuthorizationId('opaque_id'), 'opaque_id')
  assert.equal(
    resolveSsoAuthorizationId(undefined, '/auth/login?sso_authorization_id=opaque_id'),
    'opaque_id'
  )
  assert.equal(
    resolveSsoAuthorizationId(
      undefined,
      'https://evil.example/auth/login?sso_authorization_id=opaque_id'
    ),
    undefined
  )
  assert.equal(resolveSsoAuthorizationId(['opaque_id']), undefined)
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
