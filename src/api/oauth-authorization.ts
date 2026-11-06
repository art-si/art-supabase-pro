import { useSupabase } from '@/hooks/core/useSupabase'
import { checkCurrentUserAccess, recoverCurrentAuthSession } from '@/api/auth'
import { resolveOAuthAuthorizationRedirect } from '@/utils/oauth-authorization'
import { isCloudBaseBaas } from '@/config/baas-provider'
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js'

export type OAuthAuthorizationView =
  | { status: 'login-required' }
  | { status: 'consent'; details: OAuthAuthorizationDetails }
  | { status: 'redirect'; url: string }

/** Isolated identity-provider entry; existing password/OAuth login is unchanged. */
export async function fetchOAuthAuthorization(
  authorizationId: string
): Promise<OAuthAuthorizationView> {
  if (isCloudBaseBaas) throw new Error('当前部署暂不支持统一认证授权，请使用 Supabase 部署入口')
  const session = await recoverCurrentAuthSession()
  if (session.status === 'expired') return { status: 'login-required' }
  await checkCurrentUserAccess(false)
  const { supabase } = useSupabase()
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
  if (error || !data) throw new Error('授权请求已失效，请返回应用重新发起登录', { cause: error })
  if ('redirect_url' in data)
    return { status: 'redirect', url: resolveOAuthAuthorizationRedirect(data.redirect_url) }
  return { status: 'consent', details: data }
}

export async function decideOAuthAuthorization(
  authorizationId: string,
  approve: boolean
): Promise<string> {
  await checkCurrentUserAccess(false)
  const { supabase } = useSupabase()
  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
  if (error || !data) throw new Error('授权处理失败，请重试或返回应用重新登录', { cause: error })
  return resolveOAuthAuthorizationRedirect(data.redirect_url)
}
