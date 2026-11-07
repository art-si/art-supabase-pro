import assert from 'node:assert/strict'
import test from 'node:test'
import {
  oauthConsentLoginTarget,
  hasSsoAuthorizeInput,
  resolveOAuthAuthorizationId,
  resolveOAuthAuthorizationRedirect,
  isFirstPartyOAuthAuthorization,
  resolveFirstPartySsoAuthorize,
  resolveSsoRequestError,
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

test('pending first-party authorize URL accepts only the configured OAuth code request', () => {
  const policy = [{ clientId: 'internal-bff', scopes: ['email', 'profile'] }]
  const url = new URL('https://identity.example/auth/v1/oauth/authorize')
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: 'internal-bff',
    redirect_uri: 'http://localhost:3010/api/auth/callback',
    state: 'a'.repeat(43),
    code_challenge: 'b'.repeat(43),
    code_challenge_method: 'S256',
    scope: 'email profile'
  }).toString()
  const parse = (value: unknown) =>
    resolveFirstPartySsoAuthorize(value, 'https://identity.example', policy)
  assert.equal(parse(url.href), url.href)
  assert.equal(
    resolveFirstPartySsoAuthorize(
      undefined,
      'https://identity.example',
      policy,
      `/auth/login?${new URLSearchParams({ sso_authorize: url.href })}`
    ),
    url.href
  )
  assert.equal(parse(undefined), undefined)
  assert.equal(hasSsoAuthorizeInput(url.href), true)
  assert.equal(hasSsoAuthorizeInput(undefined, '/auth/login?sso_authorize=invalid'), true)
  assert.equal(hasSsoAuthorizeInput(undefined, '/auth/login?redirect=%2Fdashboard'), false)
  assert.equal(resolveSsoAuthorizationId('legacy_request'), 'legacy_request')
  for (const mutate of [
    (target: URL) => (target.hostname = 'evil.example'),
    (target: URL) => (target.pathname = '/auth/v1/token'),
    (target: URL) => target.searchParams.append('state', 'duplicate'),
    (target: URL) => target.searchParams.set('prompt', 'none'),
    (target: URL) => target.searchParams.set('client_id', 'other-client'),
    (target: URL) => target.searchParams.set('response_type', 'token'),
    (target: URL) => target.searchParams.set('code_challenge_method', 'plain'),
    (target: URL) => target.searchParams.set('code_challenge', 'short'),
    (target: URL) => target.searchParams.set('scope', 'email profile phone'),
    (target: URL) =>
      target.searchParams.set('redirect_uri', 'http://evil.example/api/auth/callback'),
    (target: URL) => target.searchParams.set('redirect_uri', 'https://app.example/other'),
    (target: URL) => (target.hash = '#fragment')
  ]) {
    const altered = new URL(url)
    mutate(altered)
    assert.equal(parse(altered.href), undefined)
  }
  assert.equal(
    resolveFirstPartySsoAuthorize(
      [url.href],
      'https://identity.example',
      policy,
      `/auth/login?${new URLSearchParams({ sso_authorize: url.href })}`
    ),
    undefined
  )
})

test('only known SSO errors affect continuation, including the local OAuth callback resume', () => {
  for (const error of [
    'access_denied',
    'service_unavailable',
    'login_failed',
    'authorization_cancelled'
  ] as const) {
    assert.equal(resolveSsoRequestError(error), error)
    assert.equal(
      resolveSsoRequestError(undefined, `/auth/login?${new URLSearchParams({ sso_error: error })}`),
      error
    )
  }
  assert.equal(resolveSsoRequestError('other'), undefined)
  assert.equal(
    resolveSsoRequestError(
      undefined,
      'https://evil.example/auth/login?sso_error=service_unavailable'
    ),
    undefined
  )
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
