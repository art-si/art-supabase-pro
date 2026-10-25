import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

interface UserProfile {
  auth_user_id: string
  tenant_id: string
  status: string | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders
    })
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: corsHeaders
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), {
        status: 500,
        headers: corsHeaders
      })
    }

    const token = authHeader.slice('Bearer '.length)
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    })
    const { data: authData, error: authError } = await authClient.auth.getUser(token)
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: corsHeaders
      })
    }

    const { email, password } = await req.json()
    const targetEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    if (!targetEmail || typeof password !== 'string' || password.length < 6) {
      return new Response(JSON.stringify({ error: 'A valid email and password are required' }), {
        status: 400,
        headers: corsHeaders
      })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const { data: operator, error: operatorError } = await adminClient
      .from('sys_user')
      .select('auth_user_id, tenant_id, status')
      .eq('auth_user_id', authData.user.id)
      .maybeSingle<UserProfile>()

    if (operatorError || !operator || operator.status !== '1') {
      return new Response(JSON.stringify({ error: 'Operator account is unavailable' }), {
        status: 403,
        headers: corsHeaders
      })
    }

    const { data: canResetPassword, error: permissionError } = await authClient.rpc(
      'current_has_permission',
      { p_permission: 'System:User:ResetPassword' }
    )
    if (permissionError || canResetPassword !== true) {
      return new Response(
        JSON.stringify({ error: 'Missing permission: System:User:ResetPassword' }),
        { status: 403, headers: corsHeaders }
      )
    }

    const { data: operatorIsPlatformSuper } = await authClient.rpc('current_is_super')

    const { data: target, error: targetError } = await adminClient
      .from('sys_user')
      .select('auth_user_id, tenant_id, status')
      .eq('user_email', targetEmail)
      .maybeSingle()

    if (targetError || !target?.auth_user_id || target.status !== '1') {
      return new Response(JSON.stringify({ error: 'User not found or disabled' }), {
        status: 404,
        headers: corsHeaders
      })
    }

    if (operatorIsPlatformSuper !== true && target.tenant_id !== operator.tenant_id) {
      return new Response(JSON.stringify({ error: 'Cannot reset a user in another tenant' }), {
        status: 403,
        headers: corsHeaders
      })
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(target.auth_user_id, {
      password
    })
    if (updateError) {
      return new Response(JSON.stringify({ error: 'Password reset failed' }), {
        status: 400,
        headers: corsHeaders
      })
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
  } catch {
    return new Response(JSON.stringify({ error: 'Unexpected server error' }), {
      status: 500,
      headers: corsHeaders
    })
  }
})

