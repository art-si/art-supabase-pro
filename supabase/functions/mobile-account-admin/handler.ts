export interface AccountAdminInput {
  action: 'create' | 'reset_password' | 'configuration'
  tenantId?: string
  authUserId?: string
  email?: string
  password?: string
  [key: string]: unknown
}

export interface AccountAdminServices {
  authorize: (token: string, input: AccountAdminInput) => Promise<void>
  validatePassword: (token: string, password: string) => Promise<void>
  create: (input: AccountAdminInput) => Promise<string>
  bind: (token: string, input: AccountAdminInput, authUserId: string) => Promise<unknown>
  removeFailedAccount: (authUserId: string) => Promise<void>
  reset: (token: string, authUserId: string, password: string) => Promise<void>
  configuration: () => unknown
}

export class AccountAdminError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message) }
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-art-tenant-scope',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store'
}
const respond = (body: unknown, status = 200) => Response.json(body, { status, headers })
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createAccountAdminHandler(services: AccountAdminServices) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return respond({ code: 'METHOD_NOT_ALLOWED', error: '请求方式不受支持' }, 405)
    try {
      const token = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
      if (!token) return respond({ code: 'UNAUTHORIZED', error: '请先登录' }, 401)
      const raw = await request.text()
      if (raw.length > 8192) return respond({ code: 'INVALID_INPUT', error: '账号信息过长，请核对后重试' }, 400)
      let parsed: unknown
      try { parsed = JSON.parse(raw) } catch { return respond({ code: 'INVALID_INPUT', error: '请核对账号信息' }, 400) }
      if (!parsed || typeof parsed !== 'object' || !('action' in parsed) || typeof parsed.action !== 'string' ||
        !['create', 'reset_password', 'configuration'].includes(String(parsed.action))) {
        return respond({ code: 'INVALID_INPUT', error: '请选择有效的账号操作' }, 400)
      }
      const input = parsed as AccountAdminInput
      if (input.action === 'create' && (typeof input.tenantId !== 'string' || !uuid.test(input.tenantId) ||
        input.kind !== 'shipper' || typeof input.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()))) {
        return respond({ code: 'INVALID_INPUT', error: '请核对租户、客户身份和登录邮箱' }, 400)
      }
      if (input.action === 'reset_password' && (typeof input.authUserId !== 'string' || !uuid.test(input.authUserId))) {
        return respond({ code: 'INVALID_INPUT', error: '请选择需要重置密码的账号' }, 400)
      }
      await services.authorize(token, input)
      if (input.action === 'configuration') return respond(services.configuration())
      if (typeof input.password !== 'string' || input.password.length > 512) {
        return respond({ code: 'INVALID_PASSWORD', error: '请填写有效的密码' }, 400)
      }
      await services.validatePassword(token, input.password)
      if (input.action === 'reset_password') {
        await services.reset(token, input.authUserId!, input.password)
        return respond({ ok: true })
      }
      const authUserId = await services.create(input)
      try {
        return respond(await services.bind(token, input, authUserId))
      } catch (error) {
        await services.removeFailedAccount(authUserId)
        throw error
      }
    } catch (error) {
      if (error instanceof AccountAdminError) return respond({ code: error.code, error: error.message }, error.status)
      return respond({ code: 'MOBILE_ACCOUNT_UNAVAILABLE', error: '账号操作未完成，请重新加载后重试' }, 503)
    }
  }
}
