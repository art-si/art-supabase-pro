import { useSupabase } from '@/hooks/core/useSupabase'
import { isCloudBaseBaas } from '@/config/baas-provider'
import { signInWithCloudBaseMigration } from './providers/cloudbase/login'
import {
  formatSupabaseAuthErrorMessage,
  getFriendlySupabaseErrorMessage,
  isSupabaseSessionFailure
} from '@/utils/supabase'
import type { QueryResult } from '@/types/api/response'
import {
  isAuthError,
  isAuthSessionMissingError,
  type Provider,
  type UserIdentity
} from '@supabase/supabase-js'
const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

interface AuthSessionResponse {
  session: {
    accessToken?: string
    refreshToken?: string
  } | null
}

interface CurrentAuthTokens {
  accessToken: string
  refreshToken: string
}

export type CurrentAuthSessionRecovery =
  ({ status: 'valid' } & CurrentAuthTokens) | { status: 'expired' }

interface CurrentUserInfoResult extends QueryResult<Api.SystemManage.UserListItem> {
  session: CurrentAuthTokens
}

interface UserAccessResponse {
  allowed?: boolean
  code?: string
}

interface PasswordMigrationResponse {
  ok?: boolean
  code?: string
  message?: string
}

interface OAuthStartResponse {
  provider: string
  url: string | null
}

function isExpiredAuthSessionError(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) return true
  return isAuthError(error) && isSupabaseSessionFailure(error)
}

/**
 * 验证并刷新浏览器中的 Supabase 会话。
 *
 * 仅把明确缺失、过期或无效的凭证判定为 expired；网络及服务异常继续抛出，
 * 避免因为临时故障误退出仍然有效的账号。
 */
export async function recoverCurrentAuthSession(): Promise<CurrentAuthSessionRecovery> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) {
    if (isExpiredAuthSessionError(sessionError)) return { status: 'expired' }
    throw new Error('登录状态检查失败', { cause: sessionError })
  }
  if (!sessionData.session) return { status: 'expired' }

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  if (claimsError) {
    if (isExpiredAuthSessionError(claimsError)) return { status: 'expired' }
    throw new Error('登录身份验证失败', { cause: claimsError })
  }
  if (!claimsData?.claims.sub) return { status: 'expired' }

  const { data: refreshedSessionData, error: refreshedSessionError } =
    await supabase.auth.getSession()
  if (refreshedSessionError) {
    if (isExpiredAuthSessionError(refreshedSessionError)) return { status: 'expired' }
    throw new Error('登录状态刷新失败', { cause: refreshedSessionError })
  }
  if (!refreshedSessionData.session) return { status: 'expired' }

  return {
    status: 'valid',
    accessToken: refreshedSessionData.session.access_token,
    refreshToken: refreshedSessionData.session.refresh_token
  }
}

export async function register(payload: Api.Auth.RegisterParams) {
  const invokeResp = () =>
    supabase.functions.invoke('register-and-sync-user', {
      body: payload
    })
  return await responseHandle(invokeResp, {
    showMessage: true,
    message: '注册成功,请前往登录'
  })
}

async function checkUserAccess(
  payload: {
    email?: string
    cleanupUnprovisioned?: boolean
  },
  showErrorMessage = true
): Promise<void> {
  const invokeResp = () =>
    supabase.functions.invoke<UserAccessResponse>('check_user_status', {
      body: payload
    })
  await responseHandle(invokeResp, {
    breakReturn: true,
    showErrorMessage
  })
}

/**
 * 登录
 * @param params 登录参数
 * @returns 登录响应
 */
export async function login(params: Api.Auth.LoginParams) {
  const { password, captchaToken } = params
  const identifier = params.identifier.trim()
  if (isCloudBaseBaas) {
    const credentials = identifier.includes('@')
      ? { email: identifier.toLowerCase(), password }
      : { phone: identifier, password }
    const result = await signInWithCloudBaseMigration(
      () => supabase.auth.signInWithPassword(credentials),
      () =>
        supabase.functions.invoke<PasswordMigrationResponse>('migrate-supabase-login', {
          body: { identifier, password, captchaToken }
        })
    )
    return await responseHandle<AuthSessionResponse>(() => Promise.resolve(result), {
      showMessage: true,
      message: '登录成功',
      formatErrorMessage: formatSupabaseAuthErrorMessage
    })
  }

  if (!identifier.includes('@')) {
    const result = await responseHandle<AuthSessionResponse>(
      () =>
        supabase.functions.invoke('login-with-phone', {
          body: { phone: identifier, password, captchaToken }
        }),
      {
        showMessage: true,
        message: '登录成功',
        showErrorMessage: true
      }
    )
    const { accessToken, refreshToken } = result.data?.session ?? {}
    if (!accessToken || !refreshToken) {
      throw new Error('手机号登录未返回有效会话')
    }
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    })
    if (error) {
      throw new Error(formatSupabaseAuthErrorMessage(error), { cause: error })
    }
    return result
  }

  const email = identifier.toLowerCase()
  await checkUserAccess({ email })
  return await responseHandle<AuthSessionResponse>(
    () =>
      supabase.auth.signInWithPassword({
        email,
        password,
        options: captchaToken ? { captchaToken } : undefined
      }),
    {
      showMessage: true,
      message: '登录成功',
      formatErrorMessage: formatSupabaseAuthErrorMessage
    }
  )
}

/** OAuth 回调后执行与邮箱登录相同的业务账号、租户和角色准入检查。 */
export async function checkCurrentUserAccess(cleanupUnprovisioned = false): Promise<void> {
  await checkUserAccess({ cleanupUnprovisioned }, false)
}

/** 读取 OAuth 回调建立的 Supabase 会话。 */
export async function getCurrentAuthSession(): Promise<CurrentAuthTokens> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) {
    throw new Error('第三方登录未建立有效会话，请重新登录', { cause: error })
  }
  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token
  }
}

const toSupabaseProvider = (provider: string): Provider => {
  // auth-js 2.110 已支持 custom:*，但 SignInWithOAuthCredentials 的公开联合类型尚未同步。
  return provider as Provider
}

const createOAuthOptions = (channel: Api.Auth.AuthChannel, redirectTo: string) => ({
  redirectTo,
  scopes: channel.scopes || undefined,
  queryParams:
    channel.queryParamName && channel.queryParamValue
      ? { [channel.queryParamName]: channel.queryParamValue }
      : undefined
})

async function createAuthChannelAuthorizationUrl(
  channel: Api.Auth.AuthChannel,
  redirectTo: string
): Promise<string> {
  const result = await responseHandle<OAuthStartResponse>(
    () =>
      supabase.auth.signInWithOAuth({
        provider: toSupabaseProvider(channel.provider),
        options: {
          ...createOAuthOptions(channel, redirectTo),
          skipBrowserRedirect: true
        }
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      formatErrorMessage: formatSupabaseAuthErrorMessage
    }
  )

  const authorizationUrl = result.data?.url
  if (!authorizationUrl) throw new Error(`${channel.label}登录地址生成失败，请稍后重试`)
  return authorizationUrl
}

export async function prepareFeishuQrLogin(
  channel: Api.Auth.AuthChannel,
  redirectTo: string
): Promise<string> {
  if (channel.provider !== 'custom:feishu') {
    throw new Error('当前渠道不支持飞书扫码登录')
  }
  const authorizationUrl = await createAuthChannelAuthorizationUrl(channel, redirectTo)
  const projectUrl = isCloudBaseBaas
    ? import.meta.env.VITE_CLOUDBASE_EDGE_ORIGIN
    : import.meta.env.VITE_SUPABASE_URL
  if (!projectUrl) throw new Error('飞书扫码登录服务尚未配置')

  let response: Response
  try {
    const requestUrl = isCloudBaseBaas
      ? `${projectUrl}?function=oauth-provider-bridge&path=${encodeURIComponent('/feishu/qr-prepare')}`
      : new URL('/functions/v1/oauth-provider-bridge/feishu/qr-prepare', projectUrl).toString()
    response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(isCloudBaseBaas && import.meta.env.VITE_CLOUDBASE_PUBLISHABLE_KEY
          ? { Authorization: `Bearer ${import.meta.env.VITE_CLOUDBASE_PUBLISHABLE_KEY}` }
          : {})
      },
      body: JSON.stringify({ authorizationUrl }),
      credentials: 'omit'
    })
  } catch (error) {
    throw new Error('飞书二维码加载失败，请稍后重试', { cause: error })
  }
  if (!response.ok) throw new Error('飞书扫码登录暂时不可用，请联系平台管理员')

  const payload: unknown = await response.json().catch(() => null)
  const goto =
    payload && typeof payload === 'object' && 'goto' in payload ? payload.goto : undefined
  if (typeof goto !== 'string') throw new Error('飞书二维码地址无效，请刷新重试')
  let gotoUrl: URL
  try {
    gotoUrl = new URL(goto)
  } catch {
    throw new Error('飞书二维码地址无效，请刷新重试')
  }
  if (
    gotoUrl.origin !== 'https://passport.feishu.cn' ||
    gotoUrl.pathname !== '/suite/passport/oauth/authorize' ||
    !gotoUrl.searchParams.get('state')
  ) {
    throw new Error('飞书二维码地址无效，请刷新重试')
  }
  return gotoUrl.toString()
}

export async function signInWithAuthChannel(
  channel: Api.Auth.AuthChannel,
  redirectTo: string
): Promise<void> {
  const authorizationUrl = await createAuthChannelAuthorizationUrl(channel, redirectTo)

  let response: Response
  try {
    response = await fetch(authorizationUrl, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      headers: { Accept: 'application/json' }
    })
  } catch (error) {
    throw new Error(`${channel.label}登录服务暂时不可用，请稍后重试`, { cause: error })
  }

  if (response.type !== 'opaqueredirect' && !response.ok && response.status >= 400) {
    throw new Error(`${channel.label}登录尚未配置，请联系平台管理员`)
  }

  window.location.assign(authorizationUrl)
}

export async function linkCurrentUserIdentity(
  channel: Api.Auth.AuthChannel,
  redirectTo: string
): Promise<void> {
  await responseHandle(
    () =>
      supabase.auth.linkIdentity({
        provider: toSupabaseProvider(channel.provider),
        options: createOAuthOptions(channel, redirectTo)
      }),
    {
      breakReturn: true,
      showErrorMessage: true,
      formatErrorMessage: formatSupabaseAuthErrorMessage
    }
  )
}

const mapLinkedIdentity = (identity: UserIdentity): Api.Auth.LinkedIdentity => ({
  id: identity.identity_id,
  provider: identity.provider,
  email: typeof identity.identity_data?.email === 'string' ? identity.identity_data.email : null,
  createdAt: identity.created_at ?? null,
  updatedAt: identity.updated_at ?? null
})

export async function fetchCurrentUserIdentities(): Promise<Api.Auth.LinkedIdentity[]> {
  const { data, error } = await supabase.auth.getUserIdentities()
  if (error) throw new Error('登录方式加载失败，请稍后重试', { cause: error })
  return (data?.identities ?? []).map(mapLinkedIdentity)
}

export async function unlinkCurrentUserIdentity(identityId: string): Promise<void> {
  const { data, error } = await supabase.auth.getUserIdentities()
  if (error) throw new Error('登录方式加载失败，请稍后重试', { cause: error })
  const identity = data?.identities.find((item) => item.identity_id === identityId)
  if (!identity) throw new Error('未找到需要解绑的登录方式')
  if ((data?.identities.length ?? 0) < 2) throw new Error('请至少保留一种可用的登录方式')

  await responseHandle(() => supabase.auth.unlinkIdentity(identity), {
    breakReturn: true,
    showMessage: true,
    message: '登录方式已解绑',
    showErrorMessage: true,
    formatErrorMessage: formatSupabaseAuthErrorMessage
  })
}

/*忘记密码*/
export async function forgetPassword(params: Api.Auth.ForgetPwdParams) {
  const { email, redirectTo } = params
  return await responseHandle(
    () =>
      supabase.auth.resetPasswordForEmail(email, {
        redirectTo
      }),
    {
      breakReturn: true,
      showErrorMessage: true,
      formatErrorMessage: formatSupabaseAuthErrorMessage
    }
  )
}

/*重置密码*/
export async function resetPassword(params: Api.Auth.ResetPwdParams) {
  const { password } = params
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) {
    throw new Error('重置链接无效或已过期，请重新获取', { cause: error })
  }

  return await responseHandle(
    () =>
      supabase.auth.updateUser({
        password
      }),
    {
      breakReturn: true,
      showErrorMessage: true,
      formatErrorMessage: formatSupabaseAuthErrorMessage
    }
  )
}

/**
 * 获取用户信息
 * @returns 用户信息
 */
export async function fetchCurrentUserInfo(signal?: AbortSignal): Promise<CurrentUserInfoResult> {
  signal?.throwIfAborted()
  // 让 Supabase 从自身会话中取令牌，以便 SDK 在验证前自动刷新即将过期的会话。
  // 显式传入 Pinia 中持久化的 JWT 会跳过这个刷新步骤，导致刷新页面后误进 500。
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  // Auth SDK calls do not accept this signal. A timed-out attempt must not
  // continue into session/profile loading once its authentication call settles.
  signal?.throwIfAborted()
  if (claimsError || !claimsData) {
    throw new Error('当前登录身份校验失败', { cause: claimsError })
  }

  const uid = claimsData.claims.sub
  if (!uid) {
    throw new Error('当前登录身份缺少用户标识')
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  signal?.throwIfAborted()
  if (sessionError || !sessionData.session) {
    throw new Error('当前登录会话已失效', { cause: sessionError })
  }

  const profileQueryBuilder = supabase
    .from('sys_user')
    .select('*, tenant:sys_tenant!sys_user_tenant_id_fkey(tenant_code, tenant_name, builtin_type)')
    .eq('auth_user_id', uid)
    .is('deleted_at', null)
  const profileQuery = (
    signal ? profileQueryBuilder.abortSignal(signal) : profileQueryBuilder
  ).single()
  const superQuery = supabase.rpc('current_is_super')

  const roleNamesQuery = supabase.rpc('current_user_role_names')
  const [profileResult, superResult, roleNamesResult] = await Promise.all([
    responseHandle<Api.SystemManage.UserListItem>(() => profileQuery, {}),
    responseHandle<boolean>(() => (signal ? superQuery.abortSignal(signal) : superQuery), {}),
    responseHandle<unknown>(
      () => (signal ? roleNamesQuery.abortSignal(signal) : roleNamesQuery),
      {}
    )
  ])

  signal?.throwIfAborted()
  if (superResult.error) {
    throw new Error('账号权限校验失败，请重试', { cause: superResult.error })
  }
  if (typeof superResult.data !== 'boolean') {
    throw new Error('账号权限校验未返回有效结果，请重试')
  }

  if (profileResult.data) {
    const roleNames =
      !roleNamesResult.error &&
      Array.isArray(roleNamesResult.data) &&
      roleNamesResult.data.every((name): name is string => typeof name === 'string')
        ? roleNamesResult.data
        : profileResult.data.userRoles
    Object.assign(profileResult.data, {
      platformSuper: superResult.data,
      roleNames
    })
  }

  return {
    ...profileResult,
    session: {
      accessToken: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token
    }
  }
}

export async function updateCurrentUserProfile(params: Api.Auth.UserInfo) {
  const { userId, ...rest } = params
  return await responseHandle(
    () =>
      supabase.from('sys_user').update(keysToSnakeDeep(rest), { count: 'exact' }).eq('id', userId),
    {
      showMessage: true,
      message: '个人资料保存成功',
      breakReturn: true,
      requireAffected: true,
      formatErrorMessage: (error) => {
        const code =
          error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined
        return code === '23505'
          ? '该手机号已被其他用户使用'
          : getFriendlySupabaseErrorMessage(error, '个人资料保存失败，请稍后重试')
      }
    }
  )
}

export async function updateCurrentUserPassword(currentPassword: string, newPassword: string) {
  const session = await supabase.auth.getSession()
  const email = session.data.session?.user.email
  if (!email) throw new Error('当前账号未绑定登录邮箱')

  await responseHandle(
    () => supabase.auth.signInWithPassword({ email, password: currentPassword }),
    {
      showErrorMessage: true,
      breakReturn: true,
      formatErrorMessage: formatSupabaseAuthErrorMessage
    }
  )

  return await responseHandle(() => supabase.auth.updateUser({ password: newPassword }), {
    showMessage: true,
    message: '密码修改成功',
    breakReturn: true,
    formatErrorMessage: formatSupabaseAuthErrorMessage
  })
}

export async function logout() {
  await supabase.auth.signOut()
}
