import { createClient } from 'npm:@supabase/supabase-js@2.35.0'
import { v4 as uuidv4 } from 'npm:uuid@9.0.0'
import { validateUserAccountIdentity } from '../_shared/user-account-identity-policy.ts'

const allowedOrigins = [
  'http://localhost:3006',
  'http://localhost:3007',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://ckbftoopuyophiebamwy.supabase.co'
]
const SYS_USER_COLUMNS = new Set([
  'user_name',
  'nick_name',
  'user_gender',
  'user_phone',
  'user_email',
  'status',
  'create_by',
  'update_by',
  'update_time',
  'extra',
  'user_roles',
  'create_time',
  'auth_user_id',
  'id',
  'user_type',
  'remark',
  'avatar',
  'tenant_id',
  'organization_id',
  'account_identity_type',
  'hr_employee_id'
])

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
const supabaseDB = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

type CallerProfile = {
  id: string
  auth_user_id: string
  user_email: string
  tenant_id: string
  tenant_builtin_type: string | null
  user_roles: string[]
  builtin_roles: string[]
  status: string | null
  system_protected: boolean
}

function getOriginAllowed(origin: string | null) {
  if (!origin) return null
  if (allowedOrigins.includes(origin)) return origin
  return null
}
function corsHeaders(origin: string | null) {
  const allowed = getOriginAllowed(origin) !== null
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Requested-With, apikey, x-client-info',
    'Access-Control-Max-Age': '86400'
  }
  if (allowed) {
    headers['Access-Control-Allow-Origin'] = origin as string
    headers['Access-Control-Allow-Credentials'] = 'true'
    headers['Vary'] = 'Origin'
  } else {
    headers['Access-Control-Allow-Origin'] = '*'
  }
  return headers
}
async function json(req: Request) {
  try {
    return await req.json()
  } catch {
    return {}
  }
}
function cleanAppUserData(appUserData: unknown): Record<string, unknown> {
  if (!appUserData || typeof appUserData !== 'object') return {}
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(appUserData as Record<string, unknown>)) {
    if (value === undefined) continue
    if (SYS_USER_COLUMNS.has(key)) cleaned[key] = value
  }
  return cleaned
}
function createClientWithToken(token: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  })
}

async function getCallerProfile(callerAuthUserId: string | null): Promise<CallerProfile | null> {
  if (!callerAuthUserId) return null
  const { data, error } = await supabaseDB
    .from('sys_user')
    .select(
      'id, auth_user_id, user_email, tenant_id, user_roles, status, system_protected, sys_tenant:tenant_id(builtin_type)'
    )
    .eq('auth_user_id', callerAuthUserId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('getCallerProfile error', error.message)
    return null
  }
  const tenant = Array.isArray(data.sys_tenant) ? data.sys_tenant[0] : data.sys_tenant
  const roleCodes = data.user_roles || []
  const { data: builtinRoleRows } = roleCodes.length
    ? await supabaseDB
        .from('sys_role')
        .select('builtin_type')
        .eq('tenant_id', data.tenant_id)
        .eq('enabled', true)
        .in('role_code', roleCodes)
        .not('builtin_type', 'is', null)
    : { data: [] }
  return {
    id: data.id,
    auth_user_id: data.auth_user_id,
    user_email: String(data.user_email || '')
      .toLowerCase()
      .trim(),
    tenant_id: data.tenant_id,
    tenant_builtin_type: tenant?.builtin_type ?? null,
    user_roles: roleCodes,
    builtin_roles: (builtinRoleRows || []).map((role) => role.builtin_type).filter(Boolean),
    status: data.status ?? null,
    system_protected: data.system_protected === true
  }
}
function isPlatformSuper(profile: CallerProfile | null) {
  return Boolean(
    profile &&
    profile.system_protected === true &&
    profile.tenant_builtin_type === 'platform' &&
    profile.builtin_roles.includes('platform_super') &&
    profile.status === '1'
  )
}

function isProtectedPlatformSuperUser(snapshot: Record<string, unknown>): boolean {
  return snapshot.system_protected === true
}
async function hasPermission(
  callerSupabase: ReturnType<typeof createClient> | null,
  permission: string
): Promise<boolean> {
  if (!callerSupabase) return false
  const { data, error } = await callerSupabase.rpc('current_has_permission', {
    p_permission: permission
  })
  if (error) {
    console.error('permission check failed', permission, error.message)
    return false
  }
  return data === true
}
async function canAccessTargetUser(
  id: string,
  profile: CallerProfile | null,
  callerIsSuper: boolean
) {
  if (callerIsSuper) return true
  if (!profile) return false
  const { data, error } = await supabaseDB
    .from('sys_user')
    .select('tenant_id')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return false
  return data.tenant_id === profile.tenant_id
}
async function validateEmployeeLink(
  employeeId: unknown,
  tenantId: unknown,
  targetUserId?: string
): Promise<string | null> {
  if (employeeId === null || employeeId === undefined || employeeId === '') return null
  if (typeof employeeId !== 'string' || typeof tenantId !== 'string') return '员工档案关联信息无效'
  const { data: employee, error: employeeError } = await supabaseDB
    .from('mdm_employee')
    .select('id, tenant_id, employment_status')
    .eq('id', employeeId)
    .maybeSingle()
  if (employeeError || !employee) return '所选员工档案不存在或不可用'
  if (employee.tenant_id !== tenantId) return '不能关联当前租户之外的员工档案'
  if (!['probation', 'active'].includes(employee.employment_status))
    return '仅可为试用期或在职员工开通账号'

  let accountQuery = supabaseDB
    .from('sys_user')
    .select('id')
    .eq('hr_employee_id', employeeId)
    .is('deleted_at', null)
  if (targetUserId) accountQuery = accountQuery.neq('id', targetUserId)
  const { data: linkedUsers, error: accountError } = await accountQuery.limit(1)
  if (accountError) return '员工账号关联校验失败，请稍后重试'
  return linkedUsers?.length ? '所选员工已开通登录账号' : null
}
async function validateAccountIdentityLink(
  input: {
    identityType: unknown
    employeeId: unknown
    remark: unknown
  },
  tenantId: unknown,
  callerIsSuper: boolean,
  targetUserId?: string
): Promise<string | null> {
  if (typeof tenantId !== 'string' || !tenantId) return '账号所属租户信息无效'
  const { data: tenant, error: tenantError } = await supabaseDB
    .from('sys_tenant')
    .select('builtin_type')
    .eq('id', tenantId)
    .maybeSingle()
  if (tenantError || !tenant) return '账号所属租户不存在或不可用'

  const policyError = validateUserAccountIdentity({
    identityType: input.identityType,
    employeeId: input.employeeId,
    remark: input.remark,
    tenantBuiltinType: tenant.builtin_type,
    callerIsPlatformSuper: callerIsSuper
  })
  if (policyError) return policyError

  return input.identityType === 'employee'
    ? await validateEmployeeLink(input.employeeId, tenantId, targetUserId)
    : null
}
function getFriendlyErrorMessage(error: unknown, action: string): string {
  const errorRecord = error && typeof error === 'object' ? error as Record<string, unknown> : null
  const errorMsg = typeof errorRecord?.message === 'string' ? errorRecord.message : String(error)
  const errorCode = typeof errorRecord?.code === 'string' ? errorRecord.code : ''
  if (errorCode === '23505') {
    if (errorMsg.includes('sys_user_active_phone_key_uniq')) return '该手机号已被其他用户使用，请更换手机号'
    return '用户信息已存在，请检查手机号或邮箱后重试'
  }
  const isPermissionError =
    errorMsg.toLowerCase().includes('permission denied') ||
    errorMsg.toLowerCase().includes('row-level security') ||
    errorMsg.toLowerCase().includes('policy') ||
    errorCode === '42501' ||
    errorCode === 'PGRST301'
  if (isPermissionError) {
    const actionMap: Record<string, string> = {
      create: '创建',
      update: '编辑',
      delete: '注销',
      deactivate: '注销'
    }
    return `当前用户角色没有${actionMap[action] || action}权限，无法执行此操作`
  }
  return `${action === 'create' ? '创建' : action === 'update' ? '编辑' : '操作'}用户失败，请检查输入后重试`
}
async function insertAudit(auditId: string, requestId: string, action: string, input: unknown) {
  try {
    const { error } = await supabaseDB
      .from('sync_user_audit')
      .insert([{ id: auditId, request_id: requestId, action, input }])
    if (error) console.warn('Audit insert skipped:', error.message)
  } catch (e) {
    console.warn('Audit insert skipped:', e)
  }
}
async function updateAudit(auditId: string, result: unknown) {
  try {
    const { error } = await supabaseDB.from('sync_user_audit').update({ result }).eq('id', auditId)
    if (error) console.warn('Audit update skipped:', error.message)
  } catch (e) {
    console.warn('Audit update skipped:', e)
  }
}
async function deleteAuthUser(authUserId: string) {
  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(authUserId)
    if (error) console.error('Delete auth user failed:', error.message)
  } catch (e) {
    console.error('Delete auth user failed:', e)
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  const requestId = uuidv4()
  const body = await json(req)
  const auditId = uuidv4()
  const action = (body.action || '').toLowerCase()
  if (!['create', 'update', 'assign_roles', 'deactivate', 'delete'].includes(action))
    return new Response(JSON.stringify({ ok: false, error: 'invalid action' }), {
      status: 400,
      headers: corsHeaders(origin)
    })
  await insertAudit(auditId, requestId, action, body)

  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  let callerAuthUserId: string | null = null
  let callerEmail: string | null = null
  let callerSupabase: ReturnType<typeof createClient> | null = null
  if (bearer) {
    callerSupabase = createClientWithToken(bearer)
    try {
      const { data: user, error: userErr } = await callerSupabase.auth.getUser(bearer)
      if (!userErr && user?.user) {
        callerAuthUserId = user.user.id
        callerEmail = (user.user.email || '').toLowerCase().trim() || null
      }
    } catch (e) {
      console.error('getUser error (non-fatal):', e)
    }
  }
  const callerProfile = await getCallerProfile(callerAuthUserId)
  const callerIsSuper = isPlatformSuper(callerProfile)
  const permissionByAction: Record<string, string> = {
    create: 'System:User:Add',
    update: 'System:User:Edit',
    assign_roles: 'System:User:AssignRole',
    deactivate: 'System:User:Delete',
    delete: 'System:User:Delete'
  }
  const requiredPermission = permissionByAction[action]
  if (!(await hasPermission(callerSupabase, requiredPermission))) {
    return new Response(JSON.stringify({ ok: false, error: `缺少权限：${requiredPermission}` }), {
      status: 403,
      headers: corsHeaders(origin)
    })
  }

  try {
    if (action === 'create') {
      const emailFromBody = String(body.email || '')
        .toLowerCase()
        .trim()
      const appUserData = body.app_user_data || {}
      if (!emailFromBody)
        return new Response(JSON.stringify({ ok: false, error: 'email required' }), {
          status: 400,
          headers: corsHeaders(origin)
        })
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(emailFromBody))
        return new Response(JSON.stringify({ ok: false, error: 'Invalid email format' }), {
          status: 400,
          headers: corsHeaders(origin)
        })
      if (!callerProfile || !callerEmail)
        return new Response(JSON.stringify({ ok: false, error: '需要登录用户才能创建新用户' }), {
          status: 401,
          headers: corsHeaders(origin)
        })
      const cleanedAppUserData = cleanAppUserData(appUserData)
      const targetTenantId = callerIsSuper
        ? String(cleanedAppUserData.tenant_id || callerProfile.tenant_id)
        : callerProfile.tenant_id
      const employeeLinkError = await validateAccountIdentityLink(
        {
          identityType: cleanedAppUserData.account_identity_type,
          employeeId: cleanedAppUserData.hr_employee_id,
          remark: cleanedAppUserData.remark
        },
        targetTenantId,
        callerIsSuper
      )
      if (employeeLinkError)
        return new Response(JSON.stringify({ ok: false, error: employeeLinkError }), {
          status: 400,
          headers: corsHeaders(origin)
        })
      const password = appUserData.password || body.password || uuidv4().slice(0, 12)
      const requestedStatus = String(appUserData.status ?? '1')
      const normalizedStatus = requestedStatus === '0' ? '2' : requestedStatus
      if (String(password).length < 6)
        return new Response(
          JSON.stringify({ ok: false, error: 'Password must be at least 6 characters' }),
          { status: 400, headers: corsHeaders(origin) }
        )
      try {
        const { data: existingAuth } = await supabaseAdmin.auth.admin.listUsers()
        const existingUser = existingAuth?.users?.find(
          (u) => u.email?.toLowerCase() === emailFromBody
        )
        if (existingUser)
          return new Response(JSON.stringify({ ok: false, error: '该邮箱已被注册' }), {
            status: 400,
            headers: corsHeaders(origin)
          })
      } catch (e) {
        console.warn('check existing auth user error (non-fatal)', e)
      }
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: emailFromBody,
        password,
        email_confirm: true,
        ban_duration: normalizedStatus === '2' ? '876000h' : 'none'
      })
      if (authErr) {
        const duplicateErrors = [
          'user_already_exists',
          'duplicate key',
          'Email already registered',
          'already exists'
        ]
        const isDuplicate = duplicateErrors.some(
          (keyword) => authErr.code === keyword || (authErr.message || '').includes(keyword)
        )
        return new Response(
          JSON.stringify({
            ok: false,
            error: isDuplicate
              ? 'Email already registered'
              : `Failed to create user: ${authErr.message}`
          }),
          { status: isDuplicate ? 400 : 500, headers: corsHeaders(origin) }
        )
      }
      const authUserId = authUser.user.id
      const insertData: Record<string, unknown> = {
        ...cleanedAppUserData,
        auth_user_id: authUserId,
        user_email: emailFromBody,
        status: normalizedStatus,
        create_by: callerEmail,
        tenant_id: targetTenantId
      }
      const { data: created, error: insertErr } = await supabaseDB
        .from('sys_user')
        .insert(insertData)
        .select()
        .single()
      if (insertErr) {
        await deleteAuthUser(authUserId)
        return new Response(
          JSON.stringify({ ok: false, error: getFriendlyErrorMessage(insertErr, action) }),
          { status: insertErr.code === '23505' ? 409 : 500, headers: corsHeaders(origin) }
        )
      }
      const result = { ok: true, auth_user_id: authUserId, app_user: created }
      await updateAudit(auditId, result)
      return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders(origin) })
    }

    if (action === 'update' || action === 'assign_roles') {
      const { id, email, password, app_user_data } = body
      if (!id)
        return new Response(JSON.stringify({ ok: false, error: 'id required for update' }), {
          status: 400,
          headers: corsHeaders(origin)
        })
      if (!(await canAccessTargetUser(id, callerProfile, callerIsSuper)))
        return new Response(JSON.stringify({ ok: false, error: '不能编辑当前租户之外的用户' }), {
          status: 403,
          headers: corsHeaders(origin)
        })
      const { data: targetUser, error: targetError } = await supabaseDB
        .from('sys_user')
        .select('auth_user_id, user_email, tenant_id, status, user_roles, system_protected')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle()
      if (targetError || !targetUser) {
        return new Response(JSON.stringify({ ok: false, error: '用户不存在或不可用' }), {
          status: 404,
          headers: corsHeaders(origin)
        })
      }
      // Resolve the Auth target from the protected database row, never from request identifiers.
      const auth_user_id = targetUser.auth_user_id
      if (body.auth_user_id && body.auth_user_id !== auth_user_id) {
        return new Response(JSON.stringify({ ok: false, error: '用户身份不匹配，请刷新后重试' }), {
          status: 403,
          headers: corsHeaders(origin)
        })
      }
      const normalizedAppUserData = cleanAppUserData(app_user_data)
      const cleanedAppUserData: Record<string, unknown> =
        action === 'assign_roles'
          ? { user_roles: normalizedAppUserData.user_roles }
          : { ...normalizedAppUserData }
      if (action === 'update' && cleanedAppUserData.status === '0') cleanedAppUserData.status = '2'
      if (action === 'update') delete cleanedAppUserData.user_roles
      if (action === 'assign_roles' && !Array.isArray(cleanedAppUserData.user_roles)) {
        return new Response(JSON.stringify({ ok: false, error: 'user_roles must be an array' }), {
          status: 400,
          headers: corsHeaders(origin)
        })
      }
      if (targetUser.system_protected) {
        const changesProtectedIdentity =
          (email && String(email).toLowerCase() !== String(targetUser.user_email).toLowerCase()) ||
          (cleanedAppUserData.tenant_id && cleanedAppUserData.tenant_id !== targetUser.tenant_id) ||
          (cleanedAppUserData.status && cleanedAppUserData.status !== '1')
        if (changesProtectedIdentity || action === 'assign_roles') {
          return new Response(
            JSON.stringify({ ok: false, error: '平台超级管理员身份、角色和启用状态受系统保护' }),
            { status: 403, headers: corsHeaders(origin) }
          )
        }
      }
      if (
        !callerIsSuper &&
        cleanedAppUserData.tenant_id &&
        cleanedAppUserData.tenant_id !== callerProfile?.tenant_id
      )
        return new Response(JSON.stringify({ ok: false, error: '不能把用户分配到当前租户之外' }), {
          status: 403,
          headers: corsHeaders(origin)
        })
      if (action === 'update') {
        const { data: existingUser, error: existingUserError } = await supabaseDB
          .from('sys_user')
          .select('tenant_id, account_identity_type, hr_employee_id, remark')
          .eq('id', id)
          .maybeSingle()
        if (existingUserError || !existingUser)
          return new Response(JSON.stringify({ ok: false, error: '用户不存在或不可用' }), {
            status: 404,
            headers: corsHeaders(origin)
          })
        const targetTenantId = String(
          cleanedAppUserData.tenant_id || existingUser.tenant_id || callerProfile?.tenant_id || ''
        )
        const employeeLinkError = await validateAccountIdentityLink(
          {
            identityType:
              cleanedAppUserData.account_identity_type ?? existingUser.account_identity_type,
            employeeId: Object.prototype.hasOwnProperty.call(
              cleanedAppUserData,
              'hr_employee_id'
            )
              ? cleanedAppUserData.hr_employee_id
              : existingUser.hr_employee_id,
            remark: Object.prototype.hasOwnProperty.call(cleanedAppUserData, 'remark')
              ? cleanedAppUserData.remark
              : existingUser.remark
          },
          targetTenantId,
          callerIsSuper,
          id
        )
        if (employeeLinkError)
          return new Response(JSON.stringify({ ok: false, error: employeeLinkError }), {
            status: 400,
            headers: corsHeaders(origin)
          })
      }
      if (action === 'update' && auth_user_id) {
        const updateAuthData: Record<string, string> = {}
        const emailForAuth = email || cleanedAppUserData.user_email
        const passwordForAuth = password || (app_user_data && app_user_data.password)
        if (typeof emailForAuth === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForAuth))
          updateAuthData.email = emailForAuth
        if (typeof passwordForAuth === 'string' && passwordForAuth.trim().length >= 6)
          updateAuthData.password = passwordForAuth
        if (cleanedAppUserData.status === '1') updateAuthData.ban_duration = 'none'
        if (cleanedAppUserData.status === '2') updateAuthData.ban_duration = '876000h'
        if (Object.keys(updateAuthData).length > 0) {
          const { error: updateAuthErr } = await supabaseAdmin.auth.admin.updateUserById(
            auth_user_id,
            updateAuthData
          )
          if (updateAuthErr)
            return new Response(
              JSON.stringify({
                ok: false,
                error: `Failed to update auth user: ${updateAuthErr.message}`
              }),
              { status: 500, headers: corsHeaders(origin) }
            )
        }
      }
      if (Object.keys(cleanedAppUserData).length === 0) {
        const { data: existingUser, error: selectErr } = await supabaseDB
          .from('sys_user')
          .select('*')
          .eq('id', id)
          .single()
        if (selectErr)
          return new Response(
            JSON.stringify({ ok: false, error: getFriendlyErrorMessage(selectErr, action) }),
            { status: 500, headers: corsHeaders(origin) }
          )
        const result = { ok: true, app_user: existingUser }
        await updateAudit(auditId, result)
        return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders(origin) })
      }
      const { data: updatedUser, error: updateErr } = await supabaseDB
        .from('sys_user')
        .update(cleanedAppUserData)
        .eq('id', id)
        .select()
        .single()
      if (updateErr)
        return new Response(
          JSON.stringify({ ok: false, error: getFriendlyErrorMessage(updateErr, action) }),
          { status: updateErr.code === '23505' ? 409 : 500, headers: corsHeaders(origin) }
        )
      const result = { ok: true, app_user: updatedUser }
      await updateAudit(auditId, result)
      return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders(origin) })
    }

    if (action === 'deactivate' || action === 'delete') {
      const id = body.id
      if (!id)
        return new Response(JSON.stringify({ ok: false, error: 'id required' }), {
          status: 400,
          headers: corsHeaders(origin)
        })
      if (!(await canAccessTargetUser(id, callerProfile, callerIsSuper)))
        return new Response(JSON.stringify({ ok: false, error: '不能注销当前租户之外的用户' }), {
          status: 403,
          headers: corsHeaders(origin)
        })
      const { data: snapshot } = await supabaseDB.from('sys_user').select('*').eq('id', id).single()
      if (!snapshot)
        return new Response(JSON.stringify({ ok: false, error: '用户不存在' }), {
          status: 404,
          headers: corsHeaders(origin)
        })
      const isProtectedSuper = isProtectedPlatformSuperUser(snapshot)
      if (isProtectedSuper)
        return new Response(
          JSON.stringify({ ok: false, error: '平台超级管理员账号受系统保护，不能注销' }),
          { status: 403, headers: corsHeaders(origin) }
        )
      if (snapshot.auth_user_id === callerAuthUserId)
        return new Response(JSON.stringify({ ok: false, error: '不能注销当前登录账号' }), {
          status: 403,
          headers: corsHeaders(origin)
        })
      const deactivatedAt = new Date().toISOString()
      const deactivatedBy = callerEmail || callerProfile?.user_email || 'system'
      const { error: deactivateErr } = await supabaseDB
        .from('sys_user')
        .update({
          status: '2',
          user_roles: [],
          deleted_at: deactivatedAt,
          deleted_by: deactivatedBy,
          update_time: deactivatedAt,
          update_by: deactivatedBy
        })
        .eq('id', id)
      if (deactivateErr)
        return new Response(
          JSON.stringify({ ok: false, error: getFriendlyErrorMessage(deactivateErr, action) }),
          { status: 500, headers: corsHeaders(origin) }
        )
      if (snapshot.auth_user_id) {
        const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(
          snapshot.auth_user_id,
          { ban_duration: '876000h' }
        )
        if (banErr) {
          await supabaseDB
            .from('sys_user')
            .update({
              status: snapshot.status,
              user_roles: snapshot.user_roles,
              deleted_at: snapshot.deleted_at,
              deleted_by: snapshot.deleted_by,
              update_time: snapshot.update_time,
              update_by: snapshot.update_by
            })
            .eq('id', id)
          throw banErr
        }
      }
      const result = {
        ok: true,
        deactivated_app_user_id: id,
        auth_user_id: snapshot.auth_user_id || null,
        history_preserved: true
      }
      await updateAudit(auditId, result)
      return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders(origin) })
    }
  } catch (e) {
    const errorMsg = (e as Error).message || String(e)
    await updateAudit(auditId, { ok: false, error: errorMsg })
    return new Response(JSON.stringify({ ok: false, error: errorMsg }), {
      status: 500,
      headers: corsHeaders(origin)
    })
  }
})
