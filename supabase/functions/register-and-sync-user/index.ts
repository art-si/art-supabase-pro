import { createClient } from 'npm:@supabase/supabase-js@2.35.0'
import { v4 as uuidv4 } from 'npm:uuid@9.0.0'

const allowedOrigins = [
  'http://localhost:3006',
  'http://localhost:3007',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://869123771.github.io',
  'https://ckbftoopuyophiebamwy.supabase.co'
]

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

type JsonRecord = Record<string, unknown>

interface RegistrationRuntime {
  tenantId: string
  organizationId: string
  roleCode: string
  autoEnableUser: boolean
}

const getCorsHeaders = (origin: string | null): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Requested-With, apikey, x-client-info',
    'Access-Control-Max-Age': '86400'
  }
  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Credentials'] = 'true'
    headers['Vary'] = 'Origin'
  }
  return headers
}

const jsonResponse = (origin: string | null, status: number, body: JsonRecord): Response =>
  new Response(JSON.stringify(body), { status, headers: getCorsHeaders(origin) })

const readJson = async (req: Request): Promise<JsonRecord> => {
  try {
    const value = await req.json()
    return value && typeof value === 'object' ? (value as JsonRecord) : {}
  } catch {
    return {}
  }
}

const optionalText = (value: unknown, maxLength: number): string | null => {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, maxLength) : null
}

const buildSafeProfile = (body: JsonRecord, email: string): JsonRecord => ({
  user_name: optionalText(body.userName ?? body.user_name, 100) ?? email.split('@')[0],
  nick_name: optionalText(body.nickName ?? body.nick_name, 100),
  user_gender: optionalText(body.userGender ?? body.user_gender, 20),
  user_phone: optionalText(body.userPhone ?? body.user_phone, 30),
  remark: optionalText(body.remark, 255),
  avatar: optionalText(body.avatar, 1000)
})

const loadRegistrationRuntime = async (): Promise<RegistrationRuntime> => {
  const { data: registerTenant, error: tenantError } = await supabaseAdmin
    .from('sys_tenant')
    .select('id')
    .eq('builtin_type', 'public_register')
    .eq('status', '1')
    .single()
  if (tenantError || !registerTenant) throw new Error('注册公共租户未正确配置')

  const { data: rootOrganization, error: organizationError } = await supabaseAdmin
    .from('mdm_organization')
    .select('id')
    .eq('tenant_id', registerTenant.id)
    .eq('is_system', true)
    .eq('status', '1')
    .single()
  if (organizationError || !rootOrganization) throw new Error('注册公共租户缺少系统根组织')

  const { data: platformTenant, error: platformError } = await supabaseAdmin
    .from('sys_tenant')
    .select('id')
    .eq('builtin_type', 'platform')
    .single()
  if (platformError || !platformTenant) throw new Error('平台租户未正确配置')

  const { data: parameters, error: parameterError } = await supabaseAdmin
    .from('sys_param')
    .select('param_key, param_value')
    .eq('tenant_id', platformTenant.id)
    .eq('enabled', true)
    .in('param_key', ['registration.default_role_id', 'registration.auto_enable_user'])
  if (parameterError) throw new Error('注册策略读取失败')

  const paramMap = new Map((parameters ?? []).map((item) => [item.param_key, item.param_value]))
  const configuredRoleId = paramMap.get('registration.default_role_id')

  let roleQuery = supabaseAdmin
    .from('sys_role')
    .select('id, role_code, enabled, builtin_type, tenant_id')
    .eq('tenant_id', registerTenant.id)
    .eq('enabled', true)

  roleQuery = configuredRoleId
    ? roleQuery.eq('id', configuredRoleId)
    : roleQuery.eq('builtin_type', 'default_register')

  let { data: role, error: roleError } = await roleQuery.maybeSingle()
  if (roleError) throw new Error('默认注册角色读取失败')

  if (!role) {
    const fallback = await supabaseAdmin
      .from('sys_role')
      .select('id, role_code, enabled, builtin_type, tenant_id')
      .eq('tenant_id', registerTenant.id)
      .eq('builtin_type', 'default_register')
      .eq('enabled', true)
      .single()
    role = fallback.data
    roleError = fallback.error
  }

  if (roleError || !role || /(SUPER|ADMIN)/i.test(String(role.role_code))) {
    throw new Error('默认注册角色不安全或不可用')
  }

  return {
    tenantId: registerTenant.id,
    organizationId: rootOrganization.id,
    roleCode: role.role_code,
    autoEnableUser: String(paramMap.get('registration.auto_enable_user') ?? 'true') === 'true'
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: getCorsHeaders(origin) })
  if (req.method !== 'POST')
    return jsonResponse(origin, 405, { ok: false, error: '仅支持 POST 请求' })
  if (origin && !allowedOrigins.includes(origin))
    return jsonResponse(origin, 403, { ok: false, error: '当前来源不允许注册' })

  const requestId = uuidv4()
  const body = await readJson(req)
  const email = String(body.email ?? '')
    .trim()
    .toLowerCase()
  const password = String(body.password ?? '')

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse(origin, 400, { ok: false, error: '请输入有效邮箱' })
  }
  let authUserId: string | null = null
  try {
    const runtime = await loadRegistrationRuntime()
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      ban_duration: runtime.autoEnableUser ? 'none' : '876000h'
    })
    if (authError) {
      const duplicate = /already|duplicate|registered/i.test(
        `${authError.code ?? ''} ${authError.message ?? ''}`
      )
      return jsonResponse(origin, duplicate ? 409 : 500, {
        ok: false,
        error: duplicate ? '该邮箱已经注册' : '账号创建失败',
        requestId
      })
    }

    authUserId = authUser.user.id
    const profile = buildSafeProfile(body, email)
    const { data: createdUser, error: profileError } = await supabaseAdmin
      .from('sys_user')
      .insert({
        ...profile,
        auth_user_id: authUserId,
        user_email: email,
        user_roles: [runtime.roleCode],
        user_type: '2',
        account_identity_type: 'external',
        tenant_id: runtime.tenantId,
        organization_id: runtime.organizationId,
        status: runtime.autoEnableUser ? '1' : '2',
        create_by: email
      })
      .select('id, tenant_id, organization_id, user_roles, status')
      .single()

    if (profileError || !createdUser) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId)
      return jsonResponse(origin, 500, { ok: false, error: '用户资料创建失败', requestId })
    }

    await supabaseAdmin.from('sync_user_audit').insert({
      id: uuidv4(),
      request_id: requestId,
      action: 'register',
      input: { email },
      result: {
        ok: true,
        user_id: createdUser.id,
        tenant_id: createdUser.tenant_id,
        organization_id: createdUser.organization_id,
        role_codes: createdUser.user_roles,
        status: createdUser.status
      }
    })

    return jsonResponse(origin, 200, {
      ok: true,
      message: runtime.autoEnableUser ? '注册成功，请前往登录' : '注册成功，请等待管理员审核',
      requestId
    })
  } catch (error) {
    if (authUserId) await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => undefined)
    console.error('register-and-sync-user failed', requestId, error)
    return jsonResponse(origin, 500, {
      ok: false,
      error: error instanceof Error ? error.message : '注册服务暂时不可用',
      requestId
    })
  }
})
