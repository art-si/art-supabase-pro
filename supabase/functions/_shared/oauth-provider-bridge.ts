export type OAuthBridgeProvider = 'wechat' | 'wecom' | 'feishu'

type JsonRecord = Record<string, unknown>

interface NormalizedIdentity {
  subject: string
  name: string
  email: string
  picture: string
  provider: OAuthBridgeProvider
}

export interface OAuthBridgeConfig {
  callbackUrl: string
  issuer: string
  signingSecret: string
  wecomAgentId?: string
}

export interface OAuthBridgeDependencies {
  fetch: typeof fetch
  now: () => number
}

class OAuthBridgeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400
  ) {
    super(message)
    this.name = 'OAuthBridgeError'
  }
}

const TOKEN_AUDIENCE = 'supabase-custom-oauth'
const TOKEN_TTL_SECONDS = 10 * 60
const MAX_PROVIDER_RESPONSE_BYTES = 64 * 1024
const PROVIDER_TIMEOUT_MS = 12_000
const PROVIDERS = new Set<OAuthBridgeProvider>(['wechat', 'wecom', 'feishu'])
const ACTIONS = new Set(['authorize', 'token', 'userinfo', 'qr-prepare'])

const responseHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff'
}

const isRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const getText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const getNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const jsonResponse = (body: unknown, status = 200, headers: HeadersInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders, ...headers }
  })

const oauthErrorResponse = (error: unknown): Response => {
  const bridgeError =
    error instanceof OAuthBridgeError
      ? error
      : new OAuthBridgeError('server_error', 'OAuth 适配服务暂时不可用', 500)
  const headers: HeadersInit =
    bridgeError.code === 'invalid_client'
      ? { 'WWW-Authenticate': 'Basic realm="oauth-provider-bridge"' }
      : {}

  return jsonResponse(
    {
      error: bridgeError.code,
      error_description: bridgeError.message
    },
    bridgeError.status,
    headers
  )
}

const base64UrlEncode = (value: Uint8Array): string => {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

const base64UrlDecode = (value: string): Uint8Array<ArrayBuffer> => {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  let binary: string
  try {
    binary = atob(padded)
  } catch {
    throw new OAuthBridgeError('invalid_token', '登录凭证格式无效', 401)
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const encodeJson = (value: unknown): string =>
  base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)))

const decodeJson = (value: string): JsonRecord => {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(value))) as unknown
    if (!isRecord(parsed)) throw new Error('invalid payload')
    return parsed
  } catch (error) {
    if (error instanceof OAuthBridgeError) throw error
    throw new OAuthBridgeError('invalid_token', '登录凭证内容无效', 401)
  }
}

const importSigningKey = async (secret: string): Promise<CryptoKey> =>
  await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )

const signIdentityToken = async (
  identity: NormalizedIdentity,
  config: OAuthBridgeConfig,
  now: number
): Promise<string> => {
  const issuedAt = Math.floor(now / 1000)
  const header = encodeJson({ alg: 'HS256', typ: 'JWT' })
  const payload = encodeJson({
    iss: config.issuer,
    aud: TOKEN_AUDIENCE,
    iat: issuedAt,
    exp: issuedAt + TOKEN_TTL_SECONDS,
    sub: identity.subject,
    provider: identity.provider,
    name: identity.name,
    email: identity.email,
    email_verified: Boolean(identity.email),
    picture: identity.picture
  })
  const source = `${header}.${payload}`
  const key = await importSigningKey(config.signingSecret)
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(source))
  return `${source}.${base64UrlEncode(new Uint8Array(signature))}`
}

const verifyIdentityToken = async (
  token: string,
  config: OAuthBridgeConfig,
  now: number
): Promise<JsonRecord> => {
  const segments = token.split('.')
  if (segments.length !== 3) {
    throw new OAuthBridgeError('invalid_token', '登录凭证格式无效', 401)
  }

  const [encodedHeader = '', encodedPayload = '', encodedSignature = ''] = segments
  const header = decodeJson(encodedHeader)
  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    throw new OAuthBridgeError('invalid_token', '登录凭证算法无效', 401)
  }

  const key = await importSigningKey(config.signingSecret)
  const verified = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlDecode(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  )
  if (!verified) throw new OAuthBridgeError('invalid_token', '登录凭证签名无效', 401)

  const payload = decodeJson(encodedPayload)
  const expiresAt = getNumber(payload.exp)
  if (
    payload.iss !== config.issuer ||
    payload.aud !== TOKEN_AUDIENCE ||
    expiresAt === null ||
    expiresAt <= Math.floor(now / 1000)
  ) {
    throw new OAuthBridgeError('invalid_token', '登录凭证已失效', 401)
  }
  if (!getText(payload.sub) || !PROVIDERS.has(payload.provider as OAuthBridgeProvider)) {
    throw new OAuthBridgeError('invalid_token', '登录凭证缺少用户身份', 401)
  }
  return payload
}

const parseRoute = (
  pathname: string
): { provider: OAuthBridgeProvider; action: 'authorize' | 'token' | 'userinfo' | 'qr-prepare' } => {
  const segments = pathname.split('/').filter(Boolean)
  const functionIndex = segments.lastIndexOf('oauth-provider-bridge')
  const provider = segments[functionIndex + 1]
  const action = segments[functionIndex + 2]
  if (functionIndex < 0 || !PROVIDERS.has(provider as OAuthBridgeProvider) || !ACTIONS.has(action)) {
    throw new OAuthBridgeError('invalid_request', 'OAuth 适配地址无效', 404)
  }
  return {
    provider: provider as OAuthBridgeProvider,
    action: action as 'authorize' | 'token' | 'userinfo' | 'qr-prepare'
  }
}

const assertRuntimeConfig = (config: OAuthBridgeConfig): void => {
  if (!config.callbackUrl.startsWith('http://') && !config.callbackUrl.startsWith('https://')) {
    throw new OAuthBridgeError('server_error', 'OAuth 回调地址尚未配置', 500)
  }
  if (new TextEncoder().encode(config.signingSecret).length < 32) {
    throw new OAuthBridgeError('server_error', 'OAuth 签名密钥尚未配置', 500)
  }
}

const assertCallbackUrl = (redirectUri: string, config: OAuthBridgeConfig): void => {
  if (!redirectUri || redirectUri !== config.callbackUrl) {
    throw new OAuthBridgeError('invalid_request', 'redirect_uri 与 Supabase 回调地址不一致')
  }
}

const createRedirectResponse = (url: URL): Response =>
  new Response(null, {
    status: 302,
    headers: {
      'Cache-Control': 'no-store',
      Location: url.toString(),
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer'
    }
  })

const buildAuthorizationUrl = (
  provider: OAuthBridgeProvider,
  requestUrl: URL,
  config: OAuthBridgeConfig,
  feishuQr = false
): URL => {
  const clientId = getText(requestUrl.searchParams.get('client_id'))
  const redirectUri = getText(requestUrl.searchParams.get('redirect_uri'))
  const responseType = getText(requestUrl.searchParams.get('response_type'))
  const state = getText(requestUrl.searchParams.get('state'))
  const requestedScope = getText(requestUrl.searchParams.get('scope'))

  if (!clientId || clientId.length > 512) {
    throw new OAuthBridgeError('invalid_request', '缺少有效的 client_id')
  }
  assertCallbackUrl(redirectUri, config)
  if (responseType !== 'code') {
    throw new OAuthBridgeError('unsupported_response_type', '仅支持 authorization_code 模式')
  }
  if (!state || state.length > 1024) {
    throw new OAuthBridgeError('invalid_request', '缺少有效的 state')
  }

  if (provider === 'wechat') {
    const mode = getText(requestUrl.searchParams.get('mode')) || 'website'
    if (mode !== 'website' && mode !== 'official-account') {
      throw new OAuthBridgeError('invalid_request', '微信登录模式无效')
    }
    const authorizeUrl = new URL(
      mode === 'website'
        ? 'https://open.weixin.qq.com/connect/qrconnect'
        : 'https://open.weixin.qq.com/connect/oauth2/authorize'
    )
    authorizeUrl.searchParams.set('appid', clientId)
    authorizeUrl.searchParams.set('redirect_uri', redirectUri)
    authorizeUrl.searchParams.set('response_type', 'code')
    authorizeUrl.searchParams.set(
      'scope',
      mode === 'website' ? 'snsapi_login' : 'snsapi_userinfo'
    )
    authorizeUrl.searchParams.set('state', state)
    authorizeUrl.hash = 'wechat_redirect'
    return authorizeUrl
  }

  if (provider === 'wecom') {
    const agentId =
      getText(requestUrl.searchParams.get('agent_id')) || getText(config.wecomAgentId)
    if (!/^[0-9]{1,20}$/u.test(agentId)) {
      throw new OAuthBridgeError('server_error', '企业微信 AgentId 尚未配置', 500)
    }
    const authorizeUrl = new URL('https://login.work.weixin.qq.com/wwlogin/sso/login')
    authorizeUrl.searchParams.set('login_type', 'CorpApp')
    authorizeUrl.searchParams.set('appid', clientId)
    authorizeUrl.searchParams.set('agentid', agentId)
    authorizeUrl.searchParams.set('redirect_uri', redirectUri)
    authorizeUrl.searchParams.set('state', state)
    authorizeUrl.searchParams.set('lang', 'zh')
    return authorizeUrl
  }

  const authorizeUrl = new URL(
    feishuQr
      ? 'https://passport.feishu.cn/suite/passport/oauth/authorize'
      : 'https://accounts.feishu.cn/open-apis/authen/v1/authorize'
  )
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('response_type', 'code')
  // 飞书二维码 SDK 仅支持旧版授权端点，旧版端点不接受 scope。
  if (!feishuQr) {
    authorizeUrl.searchParams.set(
      'scope',
      requestedScope || 'contact:user.base:readonly contact:user.email:readonly'
    )
  }
  authorizeUrl.searchParams.set('state', state)
  return authorizeUrl
}

const prepareFeishuQr = async (
  request: Request,
  config: OAuthBridgeConfig,
  dependencies: OAuthBridgeDependencies
): Promise<Response> => {
  if (request.method !== 'POST') {
    throw new OAuthBridgeError('invalid_request', '扫码准备端点仅接受 POST 请求', 405)
  }
  const fields = await readRequestFields(request)
  const authorizationUrl = getText(fields.authorizationUrl)
  if (!authorizationUrl || authorizationUrl.length > 4096) {
    throw new OAuthBridgeError('invalid_request', '登录地址无效')
  }

  let oauthUrl: URL
  try {
    oauthUrl = new URL(authorizationUrl)
  } catch {
    throw new OAuthBridgeError('invalid_request', '登录地址无效')
  }
  const callbackUrl = new URL(config.callbackUrl)
  if (
    oauthUrl.origin !== callbackUrl.origin ||
    oauthUrl.pathname !== '/auth/v1/authorize' ||
    oauthUrl.searchParams.get('provider') !== 'custom:feishu' ||
    oauthUrl.username ||
    oauthUrl.password
  ) {
    throw new OAuthBridgeError('invalid_request', '登录地址与当前飞书渠道不匹配')
  }

  let response: Response
  try {
    response = await dependencies.fetch(oauthUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
    })
  } catch {
    throw new OAuthBridgeError('temporarily_unavailable', '登录服务暂时不可用', 503)
  }
  const location = response.headers.get('location')
  if (response.status !== 302 || !location) {
    throw new OAuthBridgeError('server_error', '飞书登录渠道尚未正确配置', 502)
  }
  const providerUrl = new URL(location, oauthUrl)
  const expectedProviderUrl = new URL(`${config.issuer}/feishu/authorize`)
  if (
    providerUrl.origin !== expectedProviderUrl.origin ||
    providerUrl.pathname !== expectedProviderUrl.pathname
  ) {
    throw new OAuthBridgeError('server_error', '飞书登录渠道地址不匹配', 502)
  }
  const goto = buildAuthorizationUrl('feishu', providerUrl, config, true)
  return jsonResponse(
    { goto: goto.toString() },
    200,
    { 'Access-Control-Allow-Origin': '*', Vary: 'Origin' }
  )
}

const readRequestFields = async (request: Request): Promise<JsonRecord> => {
  const contentType = request.headers.get('content-type')?.toLowerCase() || ''
  if (contentType.includes('application/json')) {
    const parsed = (await request.json().catch(() => null)) as unknown
    return isRecord(parsed) ? parsed : {}
  }

  const body = await request.text()
  const searchParams = new URLSearchParams(body)
  return Object.fromEntries(searchParams.entries())
}

const decodeBasicCredentials = (authorization: string): { id: string; secret: string } | null => {
  if (!authorization.startsWith('Basic ')) return null
  try {
    const bytes = Uint8Array.from(atob(authorization.slice(6).trim()), (character) =>
      character.charCodeAt(0)
    )
    const decoded = new TextDecoder().decode(bytes)
    const separator = decoded.indexOf(':')
    if (separator < 1) return null
    return { id: decoded.slice(0, separator), secret: decoded.slice(separator + 1) }
  } catch {
    return null
  }
}

const getClientCredentials = (
  request: Request,
  fields: JsonRecord
): { clientId: string; clientSecret: string } => {
  const basic = decodeBasicCredentials(request.headers.get('authorization') || '')
  const bodyClientId = getText(fields.client_id)
  const bodyClientSecret = getText(fields.client_secret)
  if (basic && bodyClientId && basic.id !== bodyClientId) {
    throw new OAuthBridgeError('invalid_client', 'client_id 不一致', 401)
  }
  if (basic && bodyClientSecret && basic.secret !== bodyClientSecret) {
    throw new OAuthBridgeError('invalid_client', 'client_secret 不一致', 401)
  }
  const clientId = basic?.id || bodyClientId
  const clientSecret = basic?.secret || bodyClientSecret
  if (!clientId || !clientSecret) {
    throw new OAuthBridgeError('invalid_client', '缺少客户端凭证', 401)
  }
  return { clientId, clientSecret }
}

const readProviderJson = async (response: Response): Promise<JsonRecord> => {
  const text = await response.text()
  if (new TextEncoder().encode(text).length > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new OAuthBridgeError('server_error', '身份提供方响应过大', 502)
  }
  let payload: unknown
  try {
    payload = text ? (JSON.parse(text) as unknown) : {}
  } catch {
    throw new OAuthBridgeError('server_error', '身份提供方返回了无效数据', 502)
  }
  if (!isRecord(payload)) {
    throw new OAuthBridgeError('server_error', '身份提供方响应格式无效', 502)
  }
  if (!response.ok) {
    throw new OAuthBridgeError(
      'invalid_grant',
      getText(payload.error_description) ||
        getText(payload.errmsg) ||
        getText(payload.msg) ||
        '身份提供方拒绝了授权请求',
      400
    )
  }
  return payload
}

const fetchProviderJson = async (
  fetcher: typeof fetch,
  url: string | URL,
  init: RequestInit = {}
): Promise<JsonRecord> => {
  let response: Response
  try {
    response = await fetcher(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
    })
  } catch {
    throw new OAuthBridgeError('temporarily_unavailable', '身份提供方暂时不可用', 503)
  }
  return await readProviderJson(response)
}

const assertProviderSuccess = (payload: JsonRecord): void => {
  const providerCode = getNumber(payload.errcode ?? payload.code)
  if (providerCode !== null && providerCode !== 0) {
    throw new OAuthBridgeError(
      'invalid_grant',
      getText(payload.errmsg) ||
        getText(payload.msg) ||
        getText(payload.error_description) ||
        '身份提供方授权失败'
    )
  }
  if (getText(payload.error)) {
    throw new OAuthBridgeError(
      'invalid_grant',
      getText(payload.error_description) || getText(payload.error) || '身份提供方授权失败'
    )
  }
}

const unwrapData = (payload: JsonRecord): JsonRecord =>
  isRecord(payload.data) ? payload.data : payload

const exchangeWechatCode = async (
  fetcher: typeof fetch,
  clientId: string,
  clientSecret: string,
  code: string
): Promise<NormalizedIdentity> => {
  const tokenUrl = new URL('https://api.weixin.qq.com/sns/oauth2/access_token')
  tokenUrl.searchParams.set('appid', clientId)
  tokenUrl.searchParams.set('secret', clientSecret)
  tokenUrl.searchParams.set('code', code)
  tokenUrl.searchParams.set('grant_type', 'authorization_code')
  const tokenPayload = await fetchProviderJson(fetcher, tokenUrl)
  assertProviderSuccess(tokenPayload)
  const accessToken = getText(tokenPayload.access_token)
  const openId = getText(tokenPayload.openid)
  if (!accessToken || !openId) {
    throw new OAuthBridgeError('invalid_grant', '微信未返回有效的用户凭证')
  }

  const userInfoUrl = new URL('https://api.weixin.qq.com/sns/userinfo')
  userInfoUrl.searchParams.set('access_token', accessToken)
  userInfoUrl.searchParams.set('openid', openId)
  userInfoUrl.searchParams.set('lang', 'zh_CN')
  const profile = await fetchProviderJson(fetcher, userInfoUrl)
  assertProviderSuccess(profile)
  const subject = getText(profile.unionid) || getText(profile.openid) || openId
  return {
    subject,
    name: getText(profile.nickname) || '微信用户',
    email: '',
    picture: getText(profile.headimgurl),
    provider: 'wechat'
  }
}

const tryFetchProviderJson = async (
  fetcher: typeof fetch,
  url: string | URL,
  init?: RequestInit
): Promise<JsonRecord> => {
  try {
    const payload = await fetchProviderJson(fetcher, url, init)
    assertProviderSuccess(payload)
    return payload
  } catch {
    return {}
  }
}

const exchangeWecomCode = async (
  fetcher: typeof fetch,
  clientId: string,
  clientSecret: string,
  code: string
): Promise<NormalizedIdentity> => {
  const tokenUrl = new URL('https://qyapi.weixin.qq.com/cgi-bin/gettoken')
  tokenUrl.searchParams.set('corpid', clientId)
  tokenUrl.searchParams.set('corpsecret', clientSecret)
  const tokenPayload = await fetchProviderJson(fetcher, tokenUrl)
  assertProviderSuccess(tokenPayload)
  const accessToken = getText(tokenPayload.access_token)
  if (!accessToken) {
    throw new OAuthBridgeError('invalid_client', '企业微信应用凭证无效', 401)
  }

  const identityUrl = new URL('https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo')
  identityUrl.searchParams.set('access_token', accessToken)
  identityUrl.searchParams.set('code', code)
  const identityPayload = await fetchProviderJson(fetcher, identityUrl)
  assertProviderSuccess(identityPayload)
  const userId =
    getText(identityPayload.userid) ||
    getText(identityPayload.UserId) ||
    getText(identityPayload.open_userid)
  if (!userId) throw new OAuthBridgeError('invalid_grant', '企业微信未返回有效的成员身份')

  let profile: JsonRecord = {}
  const userTicket = getText(identityPayload.user_ticket)
  if (userTicket) {
    const detailUrl = new URL('https://qyapi.weixin.qq.com/cgi-bin/auth/getuserdetail')
    detailUrl.searchParams.set('access_token', accessToken)
    profile = await tryFetchProviderJson(fetcher, detailUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_ticket: userTicket })
    })
  }
  if (Object.keys(profile).length === 0 && getText(identityPayload.userid || identityPayload.UserId)) {
    const memberUrl = new URL('https://qyapi.weixin.qq.com/cgi-bin/user/get')
    memberUrl.searchParams.set('access_token', accessToken)
    memberUrl.searchParams.set('userid', userId)
    profile = await tryFetchProviderJson(fetcher, memberUrl)
  }

  return {
    subject: userId,
    name: getText(profile.name) || '企业微信用户',
    email: getText(profile.biz_mail) || getText(profile.email),
    picture: getText(profile.avatar),
    provider: 'wecom'
  }
}

const exchangeFeishuCode = async (
  fetcher: typeof fetch,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<NormalizedIdentity> => {
  let profile: JsonRecord
  try {
    const tokenPayload = await fetchProviderJson(
      fetcher,
      'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri
        })
      }
    )
    assertProviderSuccess(tokenPayload)
    const tokenData = unwrapData(tokenPayload)
    const accessToken = getText(tokenData.access_token) || getText(tokenData.user_access_token)
    if (!accessToken) throw new OAuthBridgeError('invalid_grant', '飞书未返回有效的用户凭证')
    const userInfoPayload = await fetchProviderJson(
      fetcher,
      'https://open.feishu.cn/open-apis/authen/v1/user_info',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    assertProviderSuccess(userInfoPayload)
    profile = unwrapData(userInfoPayload)
  } catch (error) {
    if (!(error instanceof OAuthBridgeError) || error.code !== 'invalid_grant') throw error

    // 仅在新版端点拒绝授权码时尝试旧版 SDK 的授权码，保留现有新版登录路径。
    const tokenPayload = await fetchProviderJson(
      fetcher,
      'https://passport.feishu.cn/suite/passport/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri
        })
      }
    )
    assertProviderSuccess(tokenPayload)
    const accessToken = getText(tokenPayload.access_token)
    if (!accessToken) throw new OAuthBridgeError('invalid_grant', '飞书未返回有效的用户凭证')
    const userInfoPayload = await fetchProviderJson(
      fetcher,
      'https://passport.feishu.cn/suite/passport/oauth/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    assertProviderSuccess(userInfoPayload)
    profile = unwrapData(userInfoPayload)
  }
  const subject =
    getText(profile.union_id) || getText(profile.open_id) || getText(profile.user_id)
  if (!subject) throw new OAuthBridgeError('invalid_grant', '飞书未返回有效的用户身份')
  return {
    subject,
    name: getText(profile.name) || getText(profile.en_name) || '飞书用户',
    email: getText(profile.enterprise_email) || getText(profile.email),
    picture: getText(profile.avatar_url),
    provider: 'feishu'
  }
}

const exchangeCode = async (
  provider: OAuthBridgeProvider,
  request: Request,
  config: OAuthBridgeConfig,
  dependencies: OAuthBridgeDependencies
): Promise<Response> => {
  if (request.method !== 'POST') {
    throw new OAuthBridgeError('invalid_request', 'Token 端点仅接受 POST 请求', 405)
  }
  const fields = await readRequestFields(request)
  if (getText(fields.grant_type) !== 'authorization_code') {
    throw new OAuthBridgeError('unsupported_grant_type', '仅支持 authorization_code 模式')
  }
  const code = getText(fields.code)
  const redirectUri = getText(fields.redirect_uri)
  if (!code || code.length > 2048) throw new OAuthBridgeError('invalid_grant', '授权码无效')
  assertCallbackUrl(redirectUri, config)
  const { clientId, clientSecret } = getClientCredentials(request, fields)

  let identity: NormalizedIdentity
  if (provider === 'wechat') {
    identity = await exchangeWechatCode(dependencies.fetch, clientId, clientSecret, code)
  } else if (provider === 'wecom') {
    identity = await exchangeWecomCode(dependencies.fetch, clientId, clientSecret, code)
  } else {
    identity = await exchangeFeishuCode(
      dependencies.fetch,
      clientId,
      clientSecret,
      code,
      redirectUri
    )
  }

  const accessToken = await signIdentityToken(identity, config, dependencies.now())
  return jsonResponse({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: TOKEN_TTL_SECONDS,
    scope: getText(fields.scope)
  })
}

const getUserInfo = async (
  provider: OAuthBridgeProvider,
  request: Request,
  config: OAuthBridgeConfig,
  dependencies: OAuthBridgeDependencies
): Promise<Response> => {
  if (request.method !== 'GET') {
    throw new OAuthBridgeError('invalid_request', 'UserInfo 端点仅接受 GET 请求', 405)
  }
  const authorization = request.headers.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) throw new OAuthBridgeError('invalid_token', '缺少登录凭证', 401)
  const payload = await verifyIdentityToken(token, config, dependencies.now())
  if (payload.provider !== provider) {
    throw new OAuthBridgeError('invalid_token', '登录凭证与身份渠道不匹配', 401)
  }
  const subject = getText(payload.sub)
  const email = getText(payload.email)
  const name = getText(payload.name)
  const picture = getText(payload.picture)
  return jsonResponse({
    sub: subject,
    provider_id: subject,
    email: email || undefined,
    email_verified: Boolean(email),
    name,
    full_name: name,
    picture: picture || undefined,
    avatar_url: picture || undefined,
    provider: getText(payload.provider)
  })
}

export const createOAuthProviderBridge = (
  config: OAuthBridgeConfig,
  dependencyOverrides: Partial<OAuthBridgeDependencies> = {}
): ((request: Request) => Promise<Response>) => {
  const dependencies: OAuthBridgeDependencies = {
    fetch: dependencyOverrides.fetch ?? fetch,
    now: dependencyOverrides.now ?? Date.now
  }

  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Max-Age': '600'
        }
      })
    }

    try {
      assertRuntimeConfig(config)
      const route = parseRoute(new URL(request.url).pathname)
      if (route.action === 'qr-prepare') {
        if (route.provider !== 'feishu') {
          throw new OAuthBridgeError('invalid_request', '仅飞书支持页内扫码', 404)
        }
        return await prepareFeishuQr(request, config, dependencies)
      }
      if (route.action === 'authorize') {
        if (request.method !== 'GET') {
          throw new OAuthBridgeError('invalid_request', '授权端点仅接受 GET 请求', 405)
        }
        return createRedirectResponse(buildAuthorizationUrl(route.provider, new URL(request.url), config))
      }
      if (route.action === 'token') {
        return await exchangeCode(route.provider, request, config, dependencies)
      }
      return await getUserInfo(route.provider, request, config, dependencies)
    } catch (error) {
      return oauthErrorResponse(error)
    }
  }
}
