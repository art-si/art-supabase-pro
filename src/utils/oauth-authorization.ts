import type { OAuthAuthorizationDetails } from '@supabase/supabase-js'

export interface FirstPartyOAuthClient {
  clientId: string
  redirectUri: string
  scopes: readonly string[]
}

export function isFirstPartyOAuthAuthorization(
  details: Pick<OAuthAuthorizationDetails, 'client' | 'redirect_uri' | 'scope'>,
  clients: readonly FirstPartyOAuthClient[]
): boolean {
  const requestedScopes = details.scope.split(' ').filter(Boolean)
  return clients.some(
    (client) =>
      client.clientId === details.client.id &&
      client.redirectUri === details.redirect_uri &&
      requestedScopes.length > 0 &&
      requestedScopes.every((scope) => client.scopes.includes(scope))
  )
}

export function resolveSsoAuthorizationId(value: unknown, redirect?: unknown): string | undefined {
  const direct = resolveOAuthAuthorizationId(value)
  if (direct) return direct
  if (typeof redirect !== 'string' || !redirect.startsWith('/auth/login?')) return undefined
  const target = new URL(redirect, 'https://identity.invalid')
  return target.pathname === '/auth/login'
    ? resolveOAuthAuthorizationId(target.searchParams.get('sso_authorization_id'))
    : undefined
}

/** OAuth callbacks come only from the Auth server's validated response. */
export function resolveOAuthAuthorizationRedirect(value: string): string {
  const target = new URL(value)
  if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) {
    throw new Error('授权回调地址无效，请重新发起登录')
  }
  return target.href
}

export function resolveOAuthAuthorizationId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(value) ? value : undefined
}

export function oauthConsentLoginTarget(authorizationId: string): {
  path: string
  query: { redirect: string }
} {
  return {
    path: '/auth/login',
    query: {
      redirect: `/auth/oauth-consent?${new URLSearchParams({ authorization_id: authorizationId })}`
    }
  }
}
