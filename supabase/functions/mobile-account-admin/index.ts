import { createClient } from 'npm:@supabase/supabase-js@2.119.0'
import { AccountAdminError, createAccountAdminHandler } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL') || ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, serviceKey, options)

function businessError(error: { code?: string; message?: string }, fallback: string): never {
  const message = error.message && /[\u3400-\u9fff]/u.test(error.message) ? error.message : fallback
  throw new AccountAdminError(error.code || 'MOBILE_ACCOUNT_FAILED', message,
    error.code === '42501' ? 403 : ['23505', '40001', 'email_exists', 'email_address_not_authorized'].includes(error.code || '') ? 409 : 400)
}

Deno.serve((request) => {
  const caller = (token: string) => createClient(url, anonKey, {
    ...options,
    global: { headers: {
      Authorization: `Bearer ${token}`,
      ...(request.headers.has('x-art-tenant-scope') ? { 'x-art-tenant-scope': request.headers.get('x-art-tenant-scope')! } : {})
    } }
  })
  return createAccountAdminHandler({
    async authorize(token, input) {
      const { data, error } = await admin.auth.getUser(token)
      if (error || !data.user || data.user.is_anonymous) throw new AccountAdminError('UNAUTHORIZED', '登录已失效，请重新登录', 401)
      const checked = await caller(token).rpc('system_mobile_account_admin_context', {
        p_action: input.action, p_tenant_id: input.tenantId || null, p_auth_user_id: input.authUserId || null
      })
      if (checked.error) businessError(checked.error, '当前账号无权执行这项操作')
    },
    async validatePassword(token, password) {
      const { data, error } = await caller(token).from('sys_param').select('param_key,param_value')
        .eq('enabled', true).in('param_key', ['security.password.min_length', 'security.password.require_complex'])
      if (error) throw new AccountAdminError('PASSWORD_POLICY_UNAVAILABLE', '密码规则加载失败，请稍后重试', 503)
      const values = new Map((data || []).map(row => [String(row.param_key), String(row.param_value)]))
      const configuredMinimum = Number(values.get('security.password.min_length') || 6)
      const minimum = Number.isInteger(configuredMinimum) && configuredMinimum > 0 ? Math.max(6, configuredMinimum) : 6
      const complex = ['true', '1'].includes((values.get('security.password.require_complex') || '').toLowerCase())
      if (password.length < minimum) throw new AccountAdminError('INVALID_PASSWORD', `密码不能少于 ${minimum} 位`)
      if (complex && !(/[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password))) {
        throw new AccountAdminError('INVALID_PASSWORD', '密码必须包含大写字母、小写字母、数字和特殊字符')
      }
    },
    async create(input) {
      const { data, error } = await admin.auth.admin.createUser({
        email: input.email!.trim().toLowerCase(), password: input.password!, email_confirm: true,
        app_metadata: { mobile_tenant_id: input.tenantId, mobile_account_kind: 'shipper' }
      })
      if (error || !data.user) businessError(error || {}, '邮箱可能已被使用，请核对账号列表后重试')
      return data.user.id
    },
    async bind(token, input, authUserId) {
      const { data, error } = await caller(token).rpc('system_save_mobile_account', { p_input: {
        authUserId, tenantId: input.tenantId, kind: 'shipper', displayName: input.displayName,
        phone: input.phone, enabled: input.enabled, customerId: input.customerId,
        orderActorId: input.orderActorId || null, driverId: null, expectedVersion: null
      } })
      if (error) businessError(error, '货主账号关联失败，请核对客户企业和开单归属人')
      return data
    },
    async removeFailedAccount(authUserId) {
      const { error } = await admin.auth.admin.deleteUser(authUserId)
      if (error) throw new AccountAdminError('ACCOUNT_CLEANUP_FAILED', '账号开通未完成，请联系管理员核对后重试', 503)
    },
    async reset(token, authUserId, password) {
      const updated = await admin.auth.admin.updateUserById(authUserId, { password })
      if (updated.error) businessError(updated.error, '密码重置失败，请稍后重试')
      const revoked = await caller(token).rpc('system_mobile_account_password_changed', { p_auth_user_id: authUserId })
      if (revoked.error) businessError(revoked.error, '密码已更新，但原会话清理失败，请重试重置操作')
    },
    configuration() {
      const hasDigestKey = (Deno.env.get('WECHAT_PHONE_BINDING_KEY') || '').length >= 32
      const apps = ['driver', 'shipper', 'smis'] as const
      return Object.fromEntries(apps.map(app => {
        const shared = app === 'driver' || (app === 'shipper' && !Deno.env.get('WECHAT_SHIPPER_MP_APPID') && !Deno.env.get('WECHAT_SHIPPER_MP_SECRET'))
        const prefix = shared ? 'WECHAT_MP' : `WECHAT_${app.toUpperCase()}_MP`
        return [app, { configured: hasDigestKey && Boolean(Deno.env.get(`${prefix}_APPID`) && Deno.env.get(`${prefix}_SECRET`)),
          appId: Deno.env.get(`${prefix}_APPID`) || '', usesSharedWechatApp: app === 'shipper' && shared,
          missing: [...(!hasDigestKey ? ['WECHAT_PHONE_BINDING_KEY'] : []),
            ...(['APPID', 'SECRET'] as const).filter(key => !Deno.env.get(`${prefix}_${key}`)).map(key => `${prefix}_${key}`)] }]
      }))
    }
  })(request)
})
