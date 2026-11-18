import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createDriverPasswordHandler,
  type DriverPasswordServices
} from '../../supabase/functions/driver-auth/handler'
import {
  AccountAdminError,
  createAccountAdminHandler,
  type AccountAdminServices
} from '../../supabase/functions/mobile-account-admin/handler'

const identity = '00000000-0000-4000-8000-000000000001'
const tenant = '00000000-0000-4000-8000-000000000002'
const session = {
  access_token: 'fixture-access',
  refresh_token: 'fixture-refresh',
  user: { id: identity }
}
const post = (body: unknown, token = 'fixture-actor') =>
  new Request('https://fixture.invalid', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body)
  })
function driverFixture() {
  const revoked: string[] = []
  const services: DriverPasswordServices = {
    candidates: async () => [{ auth_user_id: identity, email: 'driver@example.invalid' }],
    signIn: async () => session,
    admitted: async () => true,
    revoke: async (token) => {
      revoked.push(token)
    }
  }
  return { services, revoked, handler: createDriverPasswordHandler(services) }
}

test('driver issues a session only after its fixed identity passes admission', async () => {
  const { handler } = driverFixture()
  const response = await handler(post({ account: '13800000000', password: 'fixture-password' }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), session)
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('unbound, disabled and ambiguous driver accounts do not call password authentication', async () => {
  const { handler, services } = driverFixture()
  let passwordCalls = 0
  services.signIn = async () => {
    passwordCalls++
    return session
  }
  services.candidates = async () => []
  assert.equal(
    (await handler(post({ account: '13800000000', password: 'fixture-password' }))).status,
    403
  )
  services.candidates = async () => [
    { auth_user_id: identity, email: 'one@example.invalid' },
    { auth_user_id: 'other', email: 'two@example.invalid' }
  ]
  assert.equal(
    (await handler(post({ account: '13800000000', password: 'fixture-password' }))).status,
    409
  )
  assert.equal(passwordCalls, 0)
})

test('driver revokes a new session when its binding changes during sign-in', async () => {
  const { handler, services, revoked } = driverFixture()
  services.admitted = async () => false
  const response = await handler(
    post({ account: 'driver@example.invalid', password: 'fixture-password' })
  )
  assert.equal(response.status, 403)
  assert.deepEqual(revoked, [session.access_token])
  assert.equal((await response.text()).includes(session.access_token), false)
})

test('driver rejects a mismatched Auth identity and malformed requests without exposing tokens', async () => {
  const { handler, services, revoked } = driverFixture()
  services.signIn = async () => ({ ...session, user: { id: 'other-account' } })
  assert.equal(
    (await handler(post({ account: 'driver@example.invalid', password: 'fixture-password' })))
      .status,
    403
  )
  assert.deepEqual(revoked, [session.access_token])
  assert.equal(
    (await handler(new Request('https://fixture.invalid', { method: 'POST', body: '{' }))).status,
    400
  )
})

test('wrong driver password stays a credential error', async () => {
  const { handler, services } = driverFixture()
  services.signIn = async () => null
  const response = await handler(post({ account: 'driver@example.invalid', password: 'wrong' }))
  assert.equal(response.status, 400)
  assert.equal((await response.json()).code, 'invalid_credentials')
})

function adminFixture() {
  const calls: string[] = []
  const services: AccountAdminServices = {
    authorize: async () => {
      calls.push('authorize')
    },
    validatePassword: async () => {
      calls.push('password-policy')
    },
    create: async () => {
      calls.push('create')
      return identity
    },
    bind: async (_token, _input, id) => {
      calls.push('bind')
      return { authUserId: id }
    },
    removeFailedAccount: async (id) => {
      calls.push(`remove:${id}`)
    },
    reset: async () => {
      calls.push('reset')
    },
    configuration: () => ({ driver: { configured: true } })
  }
  return { services, calls, handler: createAccountAdminHandler(services) }
}
const creation = {
  action: 'create',
  kind: 'shipper',
  tenantId: tenant,
  email: 'shipper@example.invalid',
  password: 'fixture-password'
}

test('mobile provisioning checks authorization and password policy before creating Auth data', async () => {
  const { handler, calls } = adminFixture()
  const response = await handler(post(creation))
  assert.equal(response.status, 200)
  assert.deepEqual(calls, ['authorize', 'password-policy', 'create', 'bind'])
  assert.deepEqual(await response.json(), { authUserId: identity })
})

test('failed shipper binding removes only the newly created Auth account', async () => {
  const { handler, calls, services } = adminFixture()
  services.bind = async () => {
    throw new AccountAdminError('42501', '客户不属于当前租户', 403)
  }
  const response = await handler(post(creation))
  assert.equal(response.status, 403)
  assert.deepEqual(calls, ['authorize', 'password-policy', 'create', `remove:${identity}`])
})

test('unauthorized and weak-password attempts never create an account', async () => {
  const { handler, calls, services } = adminFixture()
  services.authorize = async () => {
    throw new AccountAdminError('42501', '无管理权限', 403)
  }
  assert.equal((await handler(post(creation))).status, 403)
  assert.deepEqual(calls, [])
  services.authorize = async () => {
    calls.push('authorize')
  }
  services.validatePassword = async () => {
    throw new AccountAdminError('INVALID_PASSWORD', '密码不符合规则')
  }
  assert.equal((await handler(post(creation))).status, 400)
  assert.deepEqual(calls, ['authorize'])
})

test('password reset is separately authorized and never returns the password', async () => {
  const { handler, calls } = adminFixture()
  const response = await handler(
    post({ action: 'reset_password', authUserId: identity, password: 'fixture-password' })
  )
  assert.deepEqual(calls, ['authorize', 'password-policy', 'reset'])
  assert.deepEqual(await response.json(), { ok: true })
})

test('malformed or unsigned admin requests have no side effects', async () => {
  const { handler, calls } = adminFixture()
  assert.equal((await handler(post(creation, ''))).status, 401)
  assert.equal((await handler(post({ ...creation, tenantId: 'bad-id' }))).status, 400)
  assert.equal(
    (
      await handler(
        new Request('https://fixture.invalid', {
          method: 'POST',
          headers: { Authorization: 'Bearer fixture' },
          body: '{'
        })
      )
    ).status,
    400
  )
  assert.deepEqual(calls, [])
})
