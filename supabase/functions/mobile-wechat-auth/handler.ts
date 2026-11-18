export const phoneErrors = {
  code: 'WECHAT_PHONE_INVALID_CODE',
  access: 'WECHAT_PHONE_NOT_ALLOWED',
  conflict: 'WECHAT_PHONE_ALREADY_BOUND',
  password: 'WECHAT_PHONE_PASSWORD_REQUIRED',
  service: 'WECHAT_PHONE_UNAVAILABLE'
} as const

export type Application = 'driver' | 'shipper' | 'smis'
export interface Account {
  id: string
  email?: string
  email_confirmed_at?: string
}
export interface LoginSession {
  access_token: string
  refresh_token: string
  user: Account
}

export interface Services {
  exchangePhone: (app: Application, code: string) => Promise<string | null>
  digest: (app: Application, phone: string) => Promise<string>
  authenticate: (token: string) => Promise<Account | null>
  findAccount: (app: Application, digest: string) => Promise<string | null>
  loadAccount: (id: string) => Promise<Account | null>
  bind: (app: Application, digest: string, id: string) => Promise<boolean>
  issueSession: (id: string, email: string) => Promise<LoginSession | null>
  mayEnter: (app: Application, token: string) => Promise<boolean>
  revoke: (token: string) => Promise<void>
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store'
}
const respond = (status: number, payload: unknown) => Response.json(payload, { status, headers: corsHeaders })

const errorResponse = (status: number, code: typeof phoneErrors[keyof typeof phoneErrors]) =>
  respond(status, { code })

export function hasRecentPassword(amr: readonly (string | { method: string; timestamp: number })[] | undefined, now: number) {
  return amr?.some(entry => typeof entry !== 'string' && entry.method === 'password' &&
    entry.timestamp <= now + 30 && entry.timestamp >= now - 600) ?? false
}

export function createWechatPhoneHandler(services: Services) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
    if (req.method !== 'POST') return errorResponse(405, phoneErrors.code)
    try {
      const raw = await req.text()
      if (raw.length > 2048) return errorResponse(400, phoneErrors.code)
      let params
      try { params = JSON.parse(raw) }
      catch { return errorResponse(400, phoneErrors.code) }
      const { app, phoneCode, action = 'login' } = params ?? {}
      if ((app !== 'driver' && app !== 'shipper' && app !== 'smis') ||
          (action !== 'login' && action !== 'bind') ||
          typeof phoneCode !== 'string' || !/^[!-~]{8,512}$/.test(phoneCode)) {
        return errorResponse(400, phoneErrors.code)
      }
      const binding = action === 'bind'
      const bearer = /^Bearer ([^\s]+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1] || ''
      const actor = binding && bearer ? await services.authenticate(bearer) : null
      if (binding && !actor) return errorResponse(401, phoneErrors.password)
      if (binding && (!actor?.email_confirmed_at || !await services.mayEnter(app, bearer))) {
        return errorResponse(403, phoneErrors.access)
      }
      const phone = await services.exchangePhone(app, phoneCode)
      if (!phone) return errorResponse(401, phoneErrors.code)
      const digest = await services.digest(app, phone)
      if (actor) {
        const success = await services.bind(app, digest, actor.id)
        return success ? respond(200, { bound: true }) : errorResponse(409, phoneErrors.conflict)
      }
      const id = await services.findAccount(app, digest)
      const account = id ? await services.loadAccount(id) : null
      if (!id || account?.id !== id || !account.email_confirmed_at || !account.email) {
        return errorResponse(403, phoneErrors.access)
      }
      const session = await services.issueSession(id, account.email)
      if (!session) return errorResponse(403, phoneErrors.access)
      let allowed = false
      try {
        // The session stays on the server until the app's existing membership check succeeds.
        allowed = session.user.id === id && await services.mayEnter(app, session.access_token)
        if (allowed) return respond(200, session)
        return errorResponse(403, phoneErrors.access)
      } finally {
        if (!allowed) await services.revoke(session.access_token).catch(() => undefined)
      }
    } catch {
      return errorResponse(503, phoneErrors.service)
    }
  }
}
