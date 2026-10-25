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

Deno.serve(async (request: Request) => {
  try {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const body = await request.json().catch(() => null)
    const email = String(body?.email ?? '')
      .trim()
      .toLowerCase()
    const cleanupUnprovisioned = body?.cleanupUnprovisioned === true

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server not configured' }, 500)

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    let authUserId: string | null = null
    if (!email) {
      const authorization = request.headers.get('authorization')
      const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
      if (!accessToken) return json({ code: 'no_authorization', error: '请重新登录后再试' }, 401)

      const { data: authData, error: authError } = await admin.auth.getUser(accessToken)
      if (authError || !authData.user) {
        return json({ code: 'bad_jwt', error: '登录状态已失效，请重新登录' }, 401)
      }
      authUserId = authData.user.id
    }

    let userQuery = admin
      .from('sys_user')
      .select('user_email,status,deleted_at,tenant_id,user_roles')
    userQuery = email ? userQuery.eq('user_email', email) : userQuery.eq('auth_user_id', authUserId)
    const { data: user, error: userError } = await userQuery.maybeSingle()

    if (userError) return json({ code: 'access_check_failed', error: '账号准入检查失败' }, 500)
    if (!user) {
      if (authUserId && cleanupUnprovisioned) {
        await admin.auth.admin.deleteUser(authUserId).catch(() => undefined)
      }
      return email
        ? json({ allowed: true, code: 'not_found' })
        : json(
            {
              allowed: false,
              code: 'user_not_provisioned',
              error: '当前身份尚未绑定系统账号，请先使用已有账号登录并完成绑定'
            },
            403
          )
    }
    if (user.deleted_at) {
      return json(
        { allowed: false, code: 'user_deactivated', error: '账号已注销，请联系管理员' },
        403
      )
    }
    if (['0', '2'].includes(String(user.status))) {
      return json({ allowed: false, code: 'user_banned', error: '账号已被停用，请联系管理员' }, 403)
    }

    const roleCodes = Array.isArray(user.user_roles)
      ? user.user_roles.filter((role): role is string => typeof role === 'string' && role.length > 0)
      : []
    const [tenantResult, rolesResult] = await Promise.all([
      admin
        .from('sys_tenant')
        .select('status,service_start_date,service_end_date')
        .eq('id', user.tenant_id)
        .maybeSingle(),
      roleCodes.length
        ? admin
            .from('sys_role')
            .select('role_code,enabled')
            .eq('tenant_id', user.tenant_id)
            .eq('enabled', true)
            .in('role_code', roleCodes)
        : Promise.resolve({ data: [], error: null })
    ])
    const { data: tenant, error: tenantError } = tenantResult
    if (tenantError) return json({ code: 'access_check_failed', error: '租户准入检查失败' }, 500)
    if (!tenant || tenant.status !== '1') {
      return json({ allowed: false, code: 'tenant_disabled', error: '所属租户已停用' }, 403)
    }

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date())
    if (tenant.service_start_date && tenant.service_start_date > today) {
      return json(
        {
          allowed: false,
          code: 'tenant_not_started',
          error: `租户服务将于 ${tenant.service_start_date} 启用`
        },
        403
      )
    }
    if (tenant.service_end_date && tenant.service_end_date < today) {
      return json(
        {
          allowed: false,
          code: 'tenant_expired',
          error: `租户服务已于 ${tenant.service_end_date} 到期，请联系平台续期`
        },
        403
      )
    }

    if (!roleCodes.length) {
      return json(
        { allowed: false, code: 'role_not_assigned', error: '当前账号尚未分配角色，请联系管理员' },
        403
      )
    }

    const { data: roles, error: roleError } = rolesResult
    if (roleError) return json({ code: 'access_check_failed', error: '角色准入检查失败' }, 500)

    const hasActiveRole = Boolean(roles?.length)
    if (!hasActiveRole) {
      return json(
        { allowed: false, code: 'role_inactive', error: '当前账号没有可用角色，请联系管理员' },
        403
      )
    }

    return json({ allowed: true })
  } catch (error) {
    console.error('check_user_status failed', error)
    return json({ code: 'unexpected_failure', error: '账号准入检查失败，请稍后重试' }, 500)
  }
})

