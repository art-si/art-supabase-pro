import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

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
    const { data: resolvedEmail, error: resolveError } = await admin.rpc(
      'resolve_login_email_by_phone',
      { p_phone: phone }
    )
    if (resolveError) {
      console.error('phone login resolver failed', resolveError)
      return json({ code: 'phone_resolve_failed', error: '登录服务暂时不可用' }, 500)
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

    const accessResponse = await fetch(`${supabaseUrl}/functions/v1/check_user_status`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${authData.session.access_token}`,
        'content-type': 'application/json'
      },
      body: '{}'
    })
    if (!accessResponse.ok) {
      const accessBody = await accessResponse.json().catch(() => null)
      return json(
        {
          code: accessBody?.code || 'access_denied',
          error: accessBody?.error || '当前账号暂时无法登录'
        },
        accessResponse.status
      )
    }

    return json({ session: authData.session })
  } catch (error) {
    console.error('login-with-phone failed', error)
    return json({ code: 'unexpected_failure', error: '登录服务暂时不可用，请稍后重试' }, 500)
  }
})

