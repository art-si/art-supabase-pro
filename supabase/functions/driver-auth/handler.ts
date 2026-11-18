export interface DriverSession {
  access_token: string
  refresh_token: string
  user: { id: string }
}

export interface DriverPasswordServices {
  candidates: (identifier: string) => Promise<{ auth_user_id: string; email: string }[]>
  signIn: (email: string, password: string) => Promise<DriverSession | null>
  admitted: (authUserId: string) => Promise<boolean>
  revoke: (token: string) => Promise<void>
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store'
}
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers })

export function createDriverPasswordHandler(services: DriverPasswordServices) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return reply({ code: 'METHOD_NOT_ALLOWED', error: '请求方式不受支持' }, 405)
    try {
      const raw = await request.text()
      if (raw.length > 4096) return reply({ code: 'INVALID_INPUT', error: '请核对账号和密码' }, 400)
      let input: unknown
      try { input = JSON.parse(raw) } catch { return reply({ code: 'INVALID_INPUT', error: '请核对账号和密码' }, 400) }
      if (!input || typeof input !== 'object' || !('account' in input) || !('password' in input) ||
        typeof input.account !== 'string' || typeof input.password !== 'string' ||
        !input.account.trim() || !input.password || input.account.length > 254 || input.password.length > 512) {
        return reply({ code: 'INVALID_INPUT', error: '请输入手机号或邮箱及密码' }, 400)
      }
      const accounts = await services.candidates(input.account.trim())
      if (accounts.length > 1) return reply({ code: 'AMBIGUOUS_ACCOUNT', error: '手机号对应多个账号，请使用邮箱登录' }, 409)
      if (!accounts.length) return reply({ code: 'DRIVER_NOT_BOUND', error: '账号未开通司机端或已停用，请联系车队管理员' }, 403)
      const account = accounts[0]
      const session = await services.signIn(account.email, input.password)
      if (!session) return reply({ code: 'invalid_credentials', error: '账号或密码错误' }, 400)
      let allowed = false
      try {
        allowed = session.user.id === account.auth_user_id && await services.admitted(session.user.id)
        if (!allowed) return reply({ code: 'DRIVER_NOT_BOUND', error: '司机关联已变更或停用，请联系车队管理员' }, 403)
        return reply(session)
      } finally {
        if (!allowed) await services.revoke(session.access_token)
      }
    } catch {
      return reply({ code: 'DRIVER_AUTH_UNAVAILABLE', error: '登录服务暂时不可用，请稍后重试' }, 503)
    }
  }
}
