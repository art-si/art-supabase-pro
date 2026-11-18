import { test } from 'node:test'
import { deepStrictEqual, equal } from 'node:assert/strict'
import {
  createWechatPhoneHandler,
  hasRecentPassword,
  type Application,
  type Services
} from '../../supabase/functions/mobile-wechat-auth/handler.ts'

const confirmed = {
  id: 'known-account',
  email: 'fixture@example.invalid',
  email_confirmed_at: '2026-01-01'
}
const session = {
  access_token: 'fixture-access',
  refresh_token: 'fixture-refresh',
  user: confirmed
}
const phone = '+8613800000001'
const issueCode = (app: Application) => `${app}-one-time-code-${crypto.randomUUID()}`
const request = (body: object, token = '') =>
  new Request('https://localhost/functions/v1/mobile-wechat-auth', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify(body)
  })

function fixture() {
  const consumed = new Set<string>()
  const bindings = new Map<string, string>()
  const revoked: string[] = []
  const allowed = new Set<Application>(['driver', 'shipper', 'smis'])
  const services: Services = {
    async exchangePhone(app, code) {
      if (!code.startsWith(`${app}-one-time-code-`) || consumed.has(code)) return null
      consumed.add(code)
      return phone
    },
    async digest(app, phone) {
      return app + ':' + phone
    },
    async authenticate(token) {
      return token === 'signed-in-user' ? confirmed : null
    },
    async findAccount(_app, digest) {
      return bindings.get(digest) ?? null
    },
    async loadAccount(id) {
      return id === confirmed.id ? confirmed : null
    },
    async bind(_app, digest, id) {
      if (bindings.has(digest) && bindings.get(digest) !== id) return false
      bindings.set(digest, id)
      return true
    },
    async issueSession() {
      return session
    },
    async mayEnter(app) {
      return allowed.has(app)
    },
    async revoke(token) {
      revoked.push(token)
    }
  }
  return {
    handler: createWechatPhoneHandler(services),
    services,
    consumed,
    bindings,
    revoked,
    allowed
  }
}

test('binding requires a recent password claim, not a refresh or one-click login', () => {
  const now = 2000
  equal(hasRecentPassword([{ method: 'password', timestamp: 1500 }], now), true)
  equal(
    hasRecentPassword(
      [
        { method: 'password', timestamp: 1399 },
        { method: 'token_refresh', timestamp: now }
      ],
      now
    ),
    false
  )
  equal(hasRecentPassword([{ method: 'magiclink', timestamp: now }], now), false)
  equal(hasRecentPassword(['password'], now), false)
})

test('one authorization binds only the authenticated account and app', async () => {
  const { handler, consumed, bindings } = fixture()
  const code = issueCode('smis')
  const claim = { app: 'smis', action: 'bind', phoneCode: code, userId: 'another-account' }
  equal((await handler(request(claim))).status, 401)
  equal(consumed.size, 0)
  const response = await handler(request(claim, 'signed-in-user'))
  equal(response.status, 200)
  deepStrictEqual(await response.json(), { bound: true })
  equal(bindings.get('smis:' + phone), confirmed.id)
  equal(bindings.has('shipper:' + phone), false)
  equal((await handler(request(claim, 'signed-in-user'))).status, 401)
})

test('honors the app, phone code and current membership when logging in', async () => {
  const { handler, bindings, allowed, revoked } = fixture()
  const login = (app: Application, phoneCode = issueCode(app)) =>
    handler(request({ app, phoneCode }))
  equal((await login('smis', issueCode('shipper'))).status, 401)
  equal((await login('smis')).status, 403)
  for (const app of ['driver', 'smis', 'shipper'] as const) {
    bindings.set(app + ':' + phone, confirmed.id)
    const response = await login(app)
    equal(response.status, 200)
    equal(response.headers.get('cache-control'), 'no-store')
    deepStrictEqual(await response.json(), session)
  }
  allowed.delete('smis')
  const rejection = await login('smis')
  equal(rejection.status, 403)
  deepStrictEqual(await rejection.json(), { code: 'WECHAT_PHONE_NOT_ALLOWED' })
  deepStrictEqual(revoked, [session.access_token])
})

test('does not transfer a binding or expose a session for a different identity', async () => {
  const { handler, services, bindings, revoked } = fixture()
  bindings.set('shipper:' + phone, 'other-account')
  const collision = await handler(
    request({ app: 'shipper', action: 'bind', phoneCode: issueCode('shipper') }, 'signed-in-user')
  )
  equal(collision.status, 409)
  equal(bindings.get('shipper:' + phone), 'other-account')
  bindings.set('shipper:' + phone, confirmed.id)
  services.issueSession = async () => ({
    ...session,
    user: { ...confirmed, id: 'changed-identity' }
  })
  equal((await handler(request({ app: 'shipper', phoneCode: issueCode('shipper') }))).status, 403)
  deepStrictEqual(revoked, [session.access_token])
})

test('uses safe failure responses for malformed input and upstream outages', async () => {
  const { handler, services } = fixture()
  equal((await handler(request({ app: 'driver', phoneCode: issueCode('smis') }))).status, 401)
  equal((await handler(request({ app: 'smis', phoneCode: ' ' }))).status, 400)
  services.exchangePhone = async () => {
    throw new Error('fixture-secret should not appear')
  }
  const response = await handler(request({ app: 'smis', phoneCode: issueCode('smis') }))
  equal(response.status, 503)
  deepStrictEqual(await response.json(), { code: 'WECHAT_PHONE_UNAVAILABLE' })
})
