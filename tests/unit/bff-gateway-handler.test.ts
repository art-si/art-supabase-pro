import assert from 'node:assert/strict'
import test from 'node:test'
import { createBffGatewayHandler } from '../../supabase/functions/_shared/bff-gateway-handler'

const subject = '01a1b61f-c4f9-7e12-8446-e6a966e9ccd9'
const secret = Buffer.alloc(32, 7).toString('base64')
const bearer = `Bearer ${'a'.repeat(40)}`
function request(body: unknown = { operation: 'catalog' }, origin = 'https://art-si.github.io') {
  return new Request('https://pro.example/functions/v1/bff-gateway', {
    method: 'POST',
    headers: { authorization: bearer, origin, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}
test('Edge bridge signs the verified subject and canonical request without forwarding browser credentials', async () => {
  let calls = 0
  const handler = createBffGatewayHandler({
    bffUrl: 'https://bff.example',
    bridgeSecret: secret,
    allowedOrigins: ['https://art-si.github.io'],
    resolveUser: async () => ({ id: subject }),
    fetcher: async (url, init) => {
      calls++
      assert.equal(String(url), 'https://bff.example/api/integrations/pro')
      const headers = new Headers(init?.headers)
      assert.equal(headers.has('authorization'), false)
      assert.equal(headers.has('cookie'), false)
      const parts = headers.get('x-bff-pro-assertion')!.split('.')
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
      assert.equal(claims.sub, subject)
      assert.equal(claims.exp - claims.iat, 60)
      const expected = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(String(init?.body))
      )
      assert.equal(claims.bodyHash, Buffer.from(expected).toString('hex'))
      const key = await crypto.subtle.importKey(
        'raw',
        Buffer.from(secret, 'base64'),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      )
      assert.equal(
        await crypto.subtle.verify(
          'HMAC',
          key,
          Buffer.from(parts[2], 'base64url'),
          new TextEncoder().encode(parts.slice(0, 2).join('.'))
        ),
        true
      )
      return new Response(JSON.stringify({ records: [] }), {
        headers: { 'Set-Cookie': 'must-not-forward=1' }
      })
    }
  })
  const response = await handler(request())
  assert.equal(response.status, 200)
  assert.equal(calls, 1)
  assert.equal(response.headers.has('set-cookie'), false)
  assert.deepEqual(await response.json(), { records: [] })
})
test('Edge bridge rejects untrusted origins, anonymous users and oversized requests before forwarding', async () => {
  let calls = 0
  const options = {
    bffUrl: 'https://bff.example',
    bridgeSecret: secret,
    allowedOrigins: ['https://art-si.github.io'],
    resolveUser: async () => ({ id: subject }),
    fetcher: async () => {
      calls++
      return new Response('{}')
    }
  }
  assert.equal(
    (await createBffGatewayHandler(options)(request({}, 'https://evil.example'))).status,
    403
  )
  assert.equal(
    (await createBffGatewayHandler({ ...options, resolveUser: async () => null })(request()))
      .status,
    401
  )
  assert.equal(
    (
      await createBffGatewayHandler(options)(
        request({ operation: 'catalog', padding: 'a'.repeat(33000) })
      )
    ).status,
    413
  )
  assert.equal(calls, 0)
})
test('production bridge rejects local HTTP, userinfo and non-origin target URLs', async () => {
  for (const bffUrl of [
    'http://localhost:3010',
    'https://u:p@bff.example',
    'https://bff.example/custom'
  ]) {
    const response = await createBffGatewayHandler({
      bffUrl,
      bridgeSecret: secret,
      allowedOrigins: [],
      resolveUser: async () => ({ id: subject })
    })(request())
    assert.equal(response.status, 403)
    const noOrigin = request()
    noOrigin.headers.delete('origin')
    assert.equal(
      (
        await createBffGatewayHandler({
          bffUrl,
          bridgeSecret: secret,
          allowedOrigins: [],
          resolveUser: async () => ({ id: subject })
        })(noOrigin)
      ).status,
      503
    )
  }
})
