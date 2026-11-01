import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import {
  callPlatformIdentity,
  parseWindowsIdentityProxy,
  PlatformIdentityError
} from '../../scripts/lib/platform-identity'

test('Windows identity requests inherit only an enabled HTTPS desktop proxy', () => {
  const settings = (server: string, enabled = '0x1') =>
    `HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\r\n    ProxyEnable    REG_DWORD    ${enabled}\r\n    ProxyServer    REG_SZ    ${server}\r\n`
  assert.equal(parseWindowsIdentityProxy(settings('127.0.0.1:7897')), 'http://127.0.0.1:7897')
  assert.equal(
    parseWindowsIdentityProxy(settings('http=127.0.0.1:8000;https=127.0.0.1:7897')),
    'http://127.0.0.1:7897'
  )
  assert.equal(parseWindowsIdentityProxy(settings('https=http://[::1]:7897')), 'http://[::1]:7897')
  assert.equal(parseWindowsIdentityProxy(settings('http=127.0.0.1:8000')), undefined)
  assert.equal(parseWindowsIdentityProxy(settings('127.0.0.1:7897', '0x0')), undefined)
  assert.equal(parseWindowsIdentityProxy(settings('invalid proxy address')), undefined)
  assert.equal(parseWindowsIdentityProxy(''), undefined)
})

test('identity transport respects an explicit proxy and separates expired login, denial and service failures', async () => {
  const token = 'test-token-never-return'
  const key = 'test-public-key'
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://identity.invalid')
    if (url.pathname === '/ok') {
      assert.equal(request.headers.authorization, `Bearer ${token}`)
      assert.equal(request.headers.apikey, key)
      assert.equal(request.headers['x-art-tenant-scope'], 'all')
      let body = ''
      for await (const chunk of request) body += chunk.toString()
      assert.deepEqual(JSON.parse(body), { permission: 'read' })
      response.end(JSON.stringify({ ok: true }))
      return
    }
    response.statusCode =
      url.pathname === '/auth/v1/user'
        ? 403
        : url.pathname === '/expired'
          ? 401
          : url.pathname === '/denied'
            ? 403
            : url.pathname === '/unavailable'
              ? 503
              : 200
    // Provider details and token echoes must never appear in the public error.
    response.end(`${token}: upstream diagnostic details`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const env = {
    ...process.env,
    ALL_PROXY: `http://127.0.0.1:${address.port}`,
    all_proxy: '',
    HTTPS_PROXY: '',
    https_proxy: '',
    HTTP_PROXY: '',
    http_proxy: '',
    NO_PROXY: '',
    no_proxy: ''
  }
  const call = (route: string, body?: object) =>
    callPlatformIdentity('http://identity.invalid', key, token, route, body, env, 'all')
  try {
    assert.deepEqual(await call('/ok', { permission: 'read' }), { ok: true })
    for (const [route, status, code] of [
      ['/auth/v1/user', 401, 'PLATFORM_AUTH_REQUIRED'],
      ['/expired', 401, 'PLATFORM_AUTH_REQUIRED'],
      ['/denied', 403, 'PLATFORM_PERMISSION_DENIED'],
      ['/unavailable', 503, 'PLATFORM_IDENTITY_UNAVAILABLE'],
      ['/malformed', 503, 'PLATFORM_IDENTITY_UNAVAILABLE']
    ] as const)
      await assert.rejects(call(route), (error: unknown) => {
        assert.ok(error instanceof PlatformIdentityError)
        assert.equal(error.status, status)
        assert.equal(error.code, code)
        assert.ok(!error.message.includes(token))
        assert.ok(!error.message.includes('upstream diagnostic'))
        return true
      })
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  await assert.rejects(call('/ok'), (error: unknown) => {
    assert.ok(error instanceof PlatformIdentityError)
    assert.equal(error.status, 503)
    assert.equal(error.code, 'PLATFORM_IDENTITY_UNAVAILABLE')
    assert.doesNotMatch(error.message, /重新登录/)
    return true
  })
})
