/** Shared by the deployed Edge Function and the local integration demonstration. */
export interface BffGatewayOptions {
  bffUrl: string
  bridgeSecret: string
  resolveUser: (authorization: string) => Promise<{ id: string } | null>
  allowedOrigins: readonly string[]
  allowLocalHttp?: boolean
  fetcher?: typeof fetch
}

const issuer = 'https://ckbftoopuyophiebamwy.supabase.co/auth/v1'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const encoder = new TextEncoder()
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
const encode = (value: unknown) => base64url(encoder.encode(JSON.stringify(value)))

function configuration(options: BffGatewayOptions): { url: URL; key: Uint8Array } | null {
  try {
    const url = new URL(options.bffUrl)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' && !(options.allowLocalHttp && local && url.protocol === 'http:'))
    )
      return null
    const key = Uint8Array.from(atob(options.bridgeSecret), (c) => c.charCodeAt(0))
    if (key.length !== 32 || btoa(String.fromCharCode(...key)) !== options.bridgeSecret) return null
    return { url, key }
  } catch {
    return null
  }
}

export function createBffGatewayHandler(options: BffGatewayOptions) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin')
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Vary: 'Origin'
    })
    const reply = (status: number, code: string, msg: string) =>
      new Response(JSON.stringify({ code, msg, message: msg }), { status, headers })
    if (origin && !options.allowedOrigins.includes(origin))
      return reply(403, 'ORIGIN_DENIED', '当前来源不可访问')
    if (origin) headers.set('Access-Control-Allow-Origin', origin)
    headers.set(
      'Access-Control-Allow-Headers',
      'authorization,apikey,content-type,x-client-info,x-art-tenant-scope'
    )
    headers.set('Access-Control-Allow-Methods', 'POST,OPTIONS')
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return reply(405, 'METHOD_NOT_ALLOWED', '请求方法不支持')
    const config = configuration(options)
    if (!config) return reply(503, 'BFF_BRIDGE_NOT_CONFIGURED', 'BFF 接入服务尚未配置')
    const authorization = request.headers.get('authorization') ?? ''
    if (!/^Bearer [A-Za-z0-9._-]{30,8192}$/.test(authorization))
      return reply(401, 'AUTH_REQUIRED', '请先完成统一登录')
    let user: { id: string } | null
    try {
      user = await options.resolveUser(authorization)
    } catch {
      return reply(503, 'AUTH_UNAVAILABLE', '身份验证服务暂时不可用')
    }
    if (!user || !uuid.test(user.id)) return reply(401, 'AUTH_REQUIRED', '统一登录已过期')
    let canonical: string
    try {
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
        return reply(400, 'INVALID_REQUEST', '请求格式不正确')
      const reader = request.body?.getReader()
      if (!reader) return reply(400, 'INVALID_REQUEST', '请求格式不正确')
      const chunks: Uint8Array[] = []
      let length = 0
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        length += chunk.value.length
        if (length > 32768) {
          await reader.cancel()
          return reply(413, 'PAYLOAD_TOO_LARGE', '请求内容过大')
        }
        chunks.push(chunk.value)
      }
      const bytes = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
      }
      const payload: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      if (
        !payload ||
        typeof payload !== 'object' ||
        Array.isArray(payload) ||
        !['catalog', 'invoke'].includes(String((payload as Record<string, unknown>).operation))
      )
        return reply(400, 'INVALID_REQUEST', '请求格式不正确')
      canonical = JSON.stringify(payload)
    } catch {
      return reply(400, 'INVALID_REQUEST', '请求格式不正确')
    }
    const bodyHash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(canonical)))
    )
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
    const now = Math.floor(Date.now() / 1000)
    const unsigned = `${encode({ alg: 'HS256', typ: 'bff-pro-bridge+jwt' })}.${encode({
      iss: issuer,
      aud: 'bff-pro-bridge',
      sub: user.id,
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + 60,
      bodyHash
    })}`
    const key = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(config.key).buffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(unsigned))
    try {
      const response = await (options.fetcher ?? fetch)(
        new URL('/api/integrations/pro', config.url),
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(60000),
          headers: {
            'Content-Type': 'application/json',
            'X-BFF-Pro-Assertion': `${unsigned}.${base64url(new Uint8Array(signature))}`
          },
          body: canonical
        }
      )
      const text = await response.text()
      if (encoder.encode(text).length > 131072)
        return reply(502, 'BFF_RESPONSE_INVALID', 'BFF 返回格式异常')
      const result: unknown = JSON.parse(text)
      if (!result || typeof result !== 'object' || Array.isArray(result))
        return reply(502, 'BFF_RESPONSE_INVALID', 'BFF 返回格式异常')
      const requestId = response.headers.get('x-request-id')
      if (requestId && uuid.test(requestId)) headers.set('X-Request-Id', requestId)
      return new Response(JSON.stringify(result), { status: response.status, headers })
    } catch {
      return reply(503, 'BFF_UNAVAILABLE', 'BFF 接入服务暂时不可用')
    }
  }
}
