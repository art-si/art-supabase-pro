import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })

const looksLikePhone = (value: string): boolean => {
  const digits = value.replace(/[^0-9]/g, '')
  return digits.length >= 8 && digits.length <= 15
}

Deno.serve(async (request: Request) => {
  try {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const body = await request.json().catch(() => null)
    const phone = String(body?.phone ?? '').trim()
    const password = String(body?.password ?? '')
    const captchaToken = String(body?.captchaToken ?? '').trim()
    const shipperApp = body?.app === 'shipper'
    if (!looksLikePhone(phone) || !password) {
      return json({ code: 'invalid_credentials', error: '手机号或密码错误' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ code: 'server_not_configured', error: '登录服务暂时不可用' }, 500)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const { data: staffEmail, error: resolveError } = await admin.rpc(
      'resolve_login_email_by_phone',
      { p_phone: phone }
    )
    if (resolveError) {
      console.error('phone login resolver failed', resolveError)
      return json({ code: 'phone_resolve_failed', error: '登录服务暂时不可用' }, 500)
    }

    let resolvedEmail = staffEmail
    let shipperIdentity: string | null = null
    if (shipperApp) {
      const lookup = await admin.rpc('mobile_account_login_candidates', { p_app: 'shipper', p_identifier: phone })
      if (lookup.error) return json({ code: 'phone_resolve_failed', error: '登录服务暂时不可用' }, 503)
      const candidates: unknown = lookup.data
      if (!Array.isArray(candidates)) return json({ code: 'phone_resolve_failed', error: '登录服务暂时不可用' }, 503)
      if (candidates.length > 1) return json({ code: 'AMBIGUOUS_ACCOUNT', error: '手机号对应多个账号，请使用邮箱登录' }, 409)
      const candidate: unknown = candidates[0]
      if (candidate && typeof candidate === 'object' && 'email' in candidate && 'auth_user_id' in candidate &&
        typeof candidate.email === 'string' && typeof candidate.auth_user_id === 'string') {
        if (typeof staffEmail === 'string' && staffEmail && staffEmail.toLowerCase() !== candidate.email.toLowerCase()) {
          return json({ code: 'AMBIGUOUS_ACCOUNT', error: '手机号对应多个账号，请使用邮箱登录' }, 409)
        }
        resolvedEmail = candidate.email
        shipperIdentity = candidate.auth_user_id
      }
    }

    const email =
      typeof resolvedEmail === 'string' && resolvedEmail
        ? resolvedEmail
        : 'missing-phone-login@invalid.local'
    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined
    })
    if (authError || !authData.session || !resolvedEmail) {
      return json({ code: 'invalid_credentials', error: '手机号或密码错误' }, 400)
    }

    const accessResponse = await fetch(`${supabaseUrl}/functions/v1/${shipperIdentity ? 'tms-shipper' : 'check_user_status'}`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${authData.session.access_token}`,
        'content-type': 'application/json'
      },
      body: shipperIdentity ? JSON.stringify({ action: 'profile' }) : '{}'
    })
    const accessBody = await accessResponse.json().catch(() => null)
    if (!accessResponse.ok || (shipperIdentity ? authData.user.id !== shipperIdentity : accessBody?.allowed !== true)) {
      await authClient.auth.signOut({ scope: 'local' })
      return json(
        {
          code: accessBody?.code || 'access_denied',
          error: accessBody?.error || '当前账号暂时无法登录'
        },
        accessResponse.ok ? 403 : accessResponse.status
      )
    }

    return json({ session: authData.session })
  } catch (error) {
    console.error('login-with-phone failed', error)
    return json({ code: 'unexpected_failure', error: '登录服务暂时不可用，请稍后重试' }, 500)
  }
})

