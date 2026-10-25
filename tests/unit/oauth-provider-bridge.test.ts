import assert from 'node:assert/strict'
import test from 'node:test'
import { createOAuthProviderBridge } from '../../supabase/functions/_shared/oauth-provider-bridge'

const CALLBACK_URL = 'https://project-ref.supabase.co/auth/v1/callback'
const BRIDGE_URL = 'https://project-ref.supabase.co/functions/v1/oauth-provider-bridge'
const SIGNING_SECRET = 'test-signing-secret-with-at-least-32-bytes'
const FIXED_NOW = 1_800_000_000_000

const createHandler = (fetcher: typeof fetch = fetch, wecomAgentId?: string) =>
  createOAuthProviderBridge(
    {
      callbackUrl: CALLBACK_URL,
      issuer: BRIDGE_URL,
      signingSecret: SIGNING_SECRET,
      wecomAgentId
    },
    { fetch: fetcher, now: () => FIXED_NOW }
  )

const createAuthorizeRequest = (
  provider: 'wechat' | 'wecom' | 'feishu',
  extra: Record<string, string> = {}
): Request => {
  const url = new URL(`${BRIDGE_URL}/${provider}/authorize`)
  url.searchParams.set('client_id', 'client-id')
  url.searchParams.set('redirect_uri', CALLBACK_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', 'csrf-state')
  Object.entries(extra).forEach(([key, value]) => url.searchParams.set(key, value))
  return new Request(url)
}

const createTokenRequest = (
  provider: 'wechat' | 'wecom' | 'feishu',
  code = 'authorization-code'
): Request => {
  const credentials = btoa('client-id:client-secret')
  return new Request(`${BRIDGE_URL}/${provider}/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: CALLBACK_URL
    })
  })
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

test('builds the official WeChat website QR authorization URL', async () => {
  const response = await createHandler()(createAuthorizeRequest('wechat'))

  assert.equal(response.status, 302)
  const location = new URL(response.headers.get('location') || '')
  assert.equal(location.origin + location.pathname, 'https://open.weixin.qq.com/connect/qrconnect')
  assert.equal(location.searchParams.get('appid'), 'client-id')
  assert.equal(location.searchParams.get('redirect_uri'), CALLBACK_URL)
  assert.equal(location.searchParams.get('scope'), 'snsapi_login')
  assert.equal(location.searchParams.get('state'), 'csrf-state')
  assert.equal(location.hash, '#wechat_redirect')
})

test('supports WeChat test official-account authorization without presenting it as PC QR login', async () => {
  const response = await createHandler()(
    createAuthorizeRequest('wechat', { mode: 'official-account', scope: 'snsapi_login' })
  )

  assert.equal(response.status, 302)
  const location = new URL(response.headers.get('location') || '')
  assert.equal(
    location.origin + location.pathname,
    'https://open.weixin.qq.com/connect/oauth2/authorize'
  )
  assert.equal(location.searchParams.get('scope'), 'snsapi_userinfo')
})

test('builds the current WeCom CorpApp login URL with an AgentId', async () => {
  const response = await createHandler(fetch, '1000002')(createAuthorizeRequest('wecom'))

  assert.equal(response.status, 302)
  const location = new URL(response.headers.get('location') || '')
  assert.equal(
    location.origin + location.pathname,
    'https://login.work.weixin.qq.com/wwlogin/sso/login'
  )
  assert.equal(location.searchParams.get('login_type'), 'CorpApp')
  assert.equal(location.searchParams.get('appid'), 'client-id')
  assert.equal(location.searchParams.get('agentid'), '1000002')
})

test('rejects authorization requests that try to replace the Supabase callback', async () => {
  const response = await createHandler()(
    createAuthorizeRequest('feishu', { redirect_uri: 'https://attacker.example/callback' })
  )

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), {
    error: 'invalid_request',
    error_description: 'redirect_uri 与 Supabase 回调地址不一致'
  })
})

test('prepares a Feishu SDK QR URL from the Supabase authorization redirect', async () => {
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    assert.equal(url.origin + url.pathname, 'https://project-ref.supabase.co/auth/v1/authorize')
    assert.equal(url.searchParams.get('provider'), 'custom:feishu')
    assert.equal(init?.redirect, 'manual')
    return new Response(null, {
      status: 302,
      headers: { Location: createAuthorizeRequest('feishu').url }
    })
  }
  const response = await createHandler(fetcher)(
    new Request(`${BRIDGE_URL}/feishu/qr-prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authorizationUrl:
          'https://project-ref.supabase.co/auth/v1/authorize?provider=custom%3Afeishu'
      })
    })
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  const payload = (await response.json()) as { goto: string }
  const goto = new URL(payload.goto)
  assert.equal(
    goto.origin + goto.pathname,
    'https://passport.feishu.cn/suite/passport/oauth/authorize'
  )
  assert.equal(goto.searchParams.get('client_id'), 'client-id')
  assert.equal(goto.searchParams.get('redirect_uri'), CALLBACK_URL)
  assert.equal(goto.searchParams.get('state'), 'csrf-state')
  assert.equal(goto.searchParams.has('scope'), false)
})

test('QR preparation rejects external authorization URLs before fetching', async () => {
  const fetcher: typeof fetch = async () => {
    assert.fail('external URL must never be fetched')
  }
  const response = await createHandler(fetcher)(
    new Request(`${BRIDGE_URL}/feishu/qr-prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authorizationUrl: 'https://attacker.example/auth/v1/authorize?provider=custom%3Afeishu'
      })
    })
  )
  assert.equal(response.status, 400)
})

test('QR preparation rejects a Supabase redirect to an unexpected provider', async () => {
  const fetcher: typeof fetch = async () =>
    new Response(null, {
      status: 302,
      headers: { Location: 'https://attacker.example/authorize' }
    })
  const response = await createHandler(fetcher)(
    new Request(`${BRIDGE_URL}/feishu/qr-prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authorizationUrl:
          'https://project-ref.supabase.co/auth/v1/authorize?provider=custom%3Afeishu'
      })
    })
  )
  assert.equal(response.status, 502)
})

test('normalizes Feishu token and nested user-info responses for Supabase', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input)
    requests.push({ url, init })
    if (url.endsWith('/authen/v2/oauth/token')) {
      return json({ code: 0, access_token: 'feishu-user-token', expires_in: 7200 })
    }
    if (url.endsWith('/authen/v1/user_info')) {
      return json({
        code: 0,
        msg: 'success',
        data: {
          union_id: 'on_feishu_union',
          open_id: 'ou_feishu_open',
          name: '飞书测试用户',
          enterprise_email: 'user@example.com',
          avatar_url: 'https://example.com/feishu-avatar.png'
        }
      })
    }
    throw new Error(`unexpected request: ${url}`)
  }
  const handler = createHandler(fetcher)

  const tokenResponse = await handler(createTokenRequest('feishu'))
  assert.equal(tokenResponse.status, 200)
  const tokenPayload = (await tokenResponse.json()) as { access_token: string }
  assert.ok(tokenPayload.access_token)
  assert.equal(requests.length, 2)

  const userInfoResponse = await handler(
    new Request(`${BRIDGE_URL}/feishu/userinfo`, {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` }
    })
  )
  assert.equal(userInfoResponse.status, 200)
  assert.deepEqual(await userInfoResponse.json(), {
    sub: 'on_feishu_union',
    provider_id: 'on_feishu_union',
    email: 'user@example.com',
    email_verified: true,
    name: '飞书测试用户',
    full_name: '飞书测试用户',
    picture: 'https://example.com/feishu-avatar.png',
    avatar_url: 'https://example.com/feishu-avatar.png',
    provider: 'feishu'
  })
})

test('exchanges legacy Feishu QR codes without changing the Supabase identity subject', async () => {
  const requests: string[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input)
    requests.push(url)
    if (url.endsWith('/authen/v2/oauth/token')) {
      return json({ code: 20003, error: 'invalid_grant' }, 400)
    }
    if (url.endsWith('/suite/passport/oauth/token')) {
      assert.equal(init?.method, 'POST')
      assert.equal(
        init?.headers && new Headers(init.headers).get('content-type'),
        'application/x-www-form-urlencoded'
      )
      return json({ access_token: 'legacy-feishu-token', token_type: 'Bearer' })
    }
    if (url.endsWith('/suite/passport/oauth/userinfo')) {
      return json({ union_id: 'on_feishu_union', open_id: 'ou_feishu_open', name: '扫码用户' })
    }
    throw new Error(`unexpected request: ${url}`)
  }
  const handler = createHandler(fetcher)
  const tokenResponse = await handler(createTokenRequest('feishu', 'legacy-qr-code'))
  assert.equal(tokenResponse.status, 200)
  assert.equal(requests.length, 3)
  const tokenPayload = (await tokenResponse.json()) as { access_token: string }
  const profileResponse = await handler(
    new Request(`${BRIDGE_URL}/feishu/userinfo`, {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` }
    })
  )
  const profile = (await profileResponse.json()) as { sub: string; provider: string }
  assert.equal(profile.sub, 'on_feishu_union')
  assert.equal(profile.provider, 'feishu')
})

test('normalizes WeChat QR login and signs an email-optional identity', async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/sns/oauth2/access_token')) {
      assert.equal(url.searchParams.get('appid'), 'client-id')
      assert.equal(url.searchParams.get('secret'), 'client-secret')
      return json({ access_token: 'wechat-user-token', openid: 'openid-1', expires_in: 7200 })
    }
    if (url.pathname.endsWith('/sns/userinfo')) {
      return json({
        openid: 'openid-1',
        unionid: 'unionid-1',
        nickname: '微信测试用户',
        headimgurl: 'https://example.com/wechat-avatar.png'
      })
    }
    throw new Error(`unexpected request: ${url}`)
  }
  const handler = createHandler(fetcher)
  const tokenResponse = await handler(createTokenRequest('wechat'))
  const tokenPayload = (await tokenResponse.json()) as { access_token: string }

  const userInfoResponse = await handler(
    new Request(`${BRIDGE_URL}/wechat/userinfo`, {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` }
    })
  )
  const profile = (await userInfoResponse.json()) as Record<string, unknown>
  assert.equal(profile.sub, 'unionid-1')
  assert.equal(profile.name, '微信测试用户')
  assert.equal(profile.email, undefined)
  assert.equal(profile.email_verified, false)
})

test('normalizes WeCom code exchange and member details', async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/cgi-bin/gettoken')) {
      return json({ errcode: 0, access_token: 'wecom-app-token', expires_in: 7200 })
    }
    if (url.pathname.endsWith('/cgi-bin/auth/getuserinfo')) {
      return json({ errcode: 0, userid: 'zhangsan', user_ticket: 'ticket-1' })
    }
    if (url.pathname.endsWith('/cgi-bin/auth/getuserdetail')) {
      return json({
        errcode: 0,
        userid: 'zhangsan',
        name: '企业微信测试用户',
        email: 'wecom@example.com',
        avatar: 'https://example.com/wecom-avatar.png'
      })
    }
    throw new Error(`unexpected request: ${url}`)
  }
  const handler = createHandler(fetcher)
  const tokenResponse = await handler(createTokenRequest('wecom'))
  assert.equal(tokenResponse.status, 200)
  const tokenPayload = (await tokenResponse.json()) as { access_token: string }

  const userInfoResponse = await handler(
    new Request(`${BRIDGE_URL}/wecom/userinfo`, {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` }
    })
  )
  const profile = (await userInfoResponse.json()) as Record<string, unknown>
  assert.equal(profile.sub, 'zhangsan')
  assert.equal(profile.email, 'wecom@example.com')
  assert.equal(profile.name, '企业微信测试用户')
})

test('rejects a modified bridge access token', async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = String(input)
    if (url.includes('/authen/v2/oauth/token')) {
      return json({ code: 0, access_token: 'token' })
    }
    return json({ code: 0, data: { open_id: 'ou_1', name: 'User' } })
  }
  const handler = createHandler(fetcher)
  const tokenResponse = await handler(createTokenRequest('feishu'))
  const tokenPayload = (await tokenResponse.json()) as { access_token: string }
  const tamperedToken = `${tokenPayload.access_token.slice(0, -1)}x`

  const response = await handler(
    new Request(`${BRIDGE_URL}/feishu/userinfo`, {
      headers: { Authorization: `Bearer ${tamperedToken}` }
    })
  )
  assert.equal(response.status, 401)
  assert.equal(((await response.json()) as { error: string }).error, 'invalid_token')
})

test('rejects a bridge token at a different provider user-info endpoint', async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = String(input)
    if (url.includes('/authen/v2/oauth/token')) {
      return json({ code: 0, access_token: 'token' })
    }
    return json({ code: 0, data: { open_id: 'ou_1', name: 'User' } })
  }
  const handler = createHandler(fetcher)
  const tokenResponse = await handler(createTokenRequest('feishu'))
  const tokenPayload = (await tokenResponse.json()) as { access_token: string }

  const response = await handler(
    new Request(`${BRIDGE_URL}/wechat/userinfo`, {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` }
    })
  )
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), {
    error: 'invalid_token',
    error_description: '登录凭证与身份渠道不匹配'
  })
})
