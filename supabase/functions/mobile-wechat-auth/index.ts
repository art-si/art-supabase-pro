import { createClient } from 'npm:@supabase/supabase-js@2.119.0'
import { createWechatPhoneHandler, hasRecentPassword, type Application, type Services } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL') || ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
const hmacSecret = Deno.env.get('WECHAT_PHONE_BINDING_KEY') || ''
const encoder = new TextEncoder()
const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const tokens = new Map<Application, { value: string; expires: number }>()
const invalidCodeErrors = new Set([40029, 40163, 41008])

const setting = (app: Application, key: 'APPID' | 'SECRET') => {
  // The shipper currently shares the driver's WeChat application for acceptance.
  // A complete shipper-specific pair takes precedence when its own app is ready.
  const shared = app === 'driver' || (app === 'shipper' &&
    !Deno.env.get('WECHAT_SHIPPER_MP_APPID') && !Deno.env.get('WECHAT_SHIPPER_MP_SECRET'))
  return (shared ? Deno.env.get(`WECHAT_MP_${key}`) : Deno.env.get(`WECHAT_${app.toUpperCase()}_MP_${key}`))?.trim()
}

async function accessToken(app: Application) {
  const appid = setting(app, 'APPID')
  const secret = setting(app, 'SECRET')
  if (!appid || !secret) {
    throw new Error('WeChat account is not configured for this app')
  }
  const cached = tokens.get(app)
  if (cached && cached.expires > Date.now()) return cached.value
  const response = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credential', appid, secret, force_refresh: false }),
    signal: AbortSignal.timeout(8000)
  })
  const result = await response.json()
  if (!response.ok || typeof result.access_token !== 'string' || !Number.isFinite(result.expires_in)) {
    throw new Error('WeChat access token is unavailable')
  }
  tokens.set(app, { value: result.access_token, expires: Date.now() + Math.max(0, result.expires_in - 120) * 1000 })
  return result.access_token as string
}

async function exchangePhone(app: Application, code: string) {
  const token = await accessToken(app)
  const endpoint = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(token)}`
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }), signal: AbortSignal.timeout(8000)
  })
  const result = await response.json()
  if (invalidCodeErrors.has(result.errcode)) return null
  if (!response.ok || result.errcode !== 0) throw new Error('WeChat phone verification is unavailable')
  const phone = result.phone_info?.purePhoneNumber
  if (String(result.phone_info?.countryCode) !== '86' || typeof phone !== 'string' || !/^1[3-9]\d{9}$/.test(phone)) return null
  return '+86' + phone
}

async function digest(app: Application, phone: string) {
  if (hmacSecret.length < 32) throw new Error('Binding key is not configured')
  const key = await crypto.subtle.importKey('raw', encoder.encode(hmacSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sum = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${app}:${phone}`)))
  return [...sum].map(n => n.toString(16).padStart(2, '0')).join('')
}

const appCodes = ['tms', 'fms', 'vms']
async function mayEnter(app: Application, token: string) {
  const headers = { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const post = (route: string, body: unknown) => fetch(url + route, {
    method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000)
  })
  if (app === 'driver') {
    const profile = await post('/rest/v1/rpc/tms_get_driver_mobile_profile', {})
    if (profile.status >= 500) throw new Error('Driver admission is unavailable')
    return profile.ok
  }
  if (app === 'shipper') {
    const customer = await post('/functions/v1/tms-shipper', { action: 'profile' })
    if (customer.ok) return true
    const info = await customer.json().catch(() => null)
    if (customer.status !== 404 && info?.code !== 'SHIPPER_NOT_BOUND') {
      if (customer.status >= 500) throw new Error('Shipper admission is unavailable')
      return false
    }
  }
  const active = await post('/functions/v1/check_user_status', {})
  if (active.status >= 500) throw new Error('Account admission is unavailable')
  if (!active.ok || (await active.json()).allowed !== true) return false
  if (app === 'smis') {
    const profile = await post('/rest/v1/rpc/smis_get_hazard_reporting_options_secure', {})
    if (profile.status >= 500) throw new Error('SMIS admission is unavailable')
    return profile.ok
  }
  const menus = await post('/rest/v1/rpc/get_menus_for_current_applications', { p_app_codes: appCodes })
  if (menus.status >= 500) throw new Error('TMS admission is unavailable')
  if (!menus.ok) return false
  const data = await menus.json()
  const permitted = appCodes.some(app => Array.isArray(data?.[app]) &&
    data[app].some((entry: { type?: string; name?: string }) => entry.type !== 'button' && typeof entry.name === 'string' && entry.name))
  if (!permitted) return false
  const buttons = await post('/rest/v1/rpc/get_current_user_button_permissions', {})
  if (buttons.status >= 500) throw new Error('TMS permissions are unavailable')
  return buttons.ok
}

const admin = createClient(url, serviceKey, authOptions)
const services: Services = {
  exchangePhone, digest, mayEnter,
  async authenticate(token) {
    const { data, error } = await admin.auth.getUser(token)
    if (error || !data.user) return null
    const { data: verified } = await admin.auth.getClaims(token)
    const now = Math.floor(Date.now() / 1000)
    const recentPassword = verified?.claims.sub === data.user.id && hasRecentPassword(verified.claims.amr, now)
    return recentPassword ? data.user : null
  },
  async findAccount(app, digest) {
    const { data, error } = await admin.rpc('mobile_wechat_phone_account', { p_app: app, p_digest: digest })
    if (error) throw new Error('Binding lookup is unavailable')
    return typeof data === 'string' ? data : null
  },
  async loadAccount(id) {
    const { data, error } = await admin.auth.admin.getUserById(id)
    return error ? null : data.user
  },
  async bind(app, digest, id) {
    const { error } = await admin.rpc('bind_mobile_wechat_phone', { p_app: app, p_digest: digest, p_account: id })
    if (error && error.code !== '23505') throw new Error('Binding write is unavailable')
    return !error
  },
  async issueSession(id, email) {
    // Recovery tokens are issued only for existing accounts; magiclink can create an account.
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'recovery', email })
    if (linkError || link.user.id !== id || !link.properties.hashed_token) return null
    const client = createClient(url, anonKey, authOptions)
    const { data, error } = await client.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'recovery' })
    if (error || !data.session) return null
    return data.session
  },
  async revoke(token) {
    await admin.auth.admin.signOut(token, 'local')
  }
}

Deno.serve(createWechatPhoneHandler(services))
