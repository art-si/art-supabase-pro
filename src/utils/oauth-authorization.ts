import type { OAuthAuthorizationDetails } from '@supabase/supabase-js'
import { uniq } from 'lodash-es'

export interface FirstPartyOAuthClient {
  clientId: string
  scopes: readonly string[]
}

/** Only the configured Auth server may receive a pending first-party code request. */
export function resolveFirstPartySsoAuthorize(
  value: unknown,
  configuredSupabaseUrl: string | undefined,
  clients: readonly FirstPartyOAuthClient[],
  redirect?: unknown
): string | undefined {
  if (!configuredSupabaseUrl) return undefined
  try {
    let candidate = value
    if (
      candidate === undefined &&
      typeof redirect === 'string' &&
      redirect.startsWith('/auth/login?')
    ) {
      const resume = new URL(redirect, 'https://identity.invalid')
      if (
        resume.pathname !== '/auth/login' ||
        resume.searchParams.getAll('sso_authorize').length !== 1
      )
        return undefined
      candidate = resume.searchParams.get('sso_authorize')
    }
    if (typeof candidate !== 'string' || !candidate || candidate.length > 2048) return undefined
    const configured = new URL(configuredSupabaseUrl)
    const target = new URL(candidate)
    const localIssuer =
      configured.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname)
    if (
      (configured.protocol !== 'https:' && !localIssuer) ||
      configured.username ||
      configured.password ||
      configured.pathname !== '/' ||
      configured.search ||
      configured.hash ||
      target.origin !== configured.origin ||
      target.pathname !== '/auth/v1/oauth/authorize' ||
      target.username ||
      target.password ||
      target.hash
    )
      return undefined

    const required = [
      'response_type',
      'client_id',
      'redirect_uri',
      'state',
      'code_challenge',
      'code_challenge_method',
      'scope'
    ] as const
    if (
      [...target.searchParams.keys()].length !== required.length ||
      required.some((key) => target.searchParams.getAll(key).length !== 1)
    )
      return undefined
    const params = target.searchParams
    const client = clients.find((item) => item.clientId === params.get('client_id'))
    const scopes = params.get('scope')?.split(' ').filter(Boolean) ?? []
    if (
      !client ||
      params.get('response_type') !== 'code' ||
      params.get('code_challenge_method') !== 'S256' ||
      !/^[A-Za-z0-9_-]{16,512}$/.test(params.get('state') || '') ||
      !/^[A-Za-z0-9_-]{43}$/.test(params.get('code_challenge') || '') ||
      scopes.length !== client.scopes.length ||
      uniq(scopes).length !== scopes.length ||
      !scopes.every((scope) => client.scopes.includes(scope))
    )
      return undefined

    const callback = new URL(params.get('redirect_uri') || '')
    const localCallback =
      callback.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname)
    if (
      (callback.protocol !== 'https:' && !localCallback) ||
      callback.username ||
      callback.password ||
      callback.pathname !== '/api/auth/callback' ||
      callback.search ||
      callback.hash
    )
      return undefined
    // Supabase Auth additionally enforces the client's exact registered callback allowlist.
    return target.href
  } catch {
    return undefined
  }
}

export function hasSsoAuthorizeInput(value: unknown, redirect?: unknown): boolean {
  if (value !== undefined) return true
  if (typeof redirect !== 'string' || !redirect.startsWith('/auth/login?')) return false
  try {
    const resume = new URL(redirect, 'https://identity.invalid')
    return resume.pathname === '/auth/login' && resume.searchParams.has('sso_authorize')
  } catch {
    return false
  }
}

export type SsoRequestError =
  'access_denied' | 'service_unavailable' | 'login_failed' | 'authorization_cancelled'

/** Only known first-party errors may shape the common login continuation. */
export function resolveSsoRequestError(
  error: unknown,
  redirect?: unknown
): SsoRequestError | undefined {
  let candidate = error
  if (
    candidate === undefined &&
    typeof redirect === 'string' &&
    redirect.startsWith('/auth/login?')
  ) {
    try {
      const resume = new URL(redirect, 'https://identity.invalid')
      if (resume.pathname === '/auth/login' && resume.searchParams.getAll('sso_error').length === 1)
        candidate = resume.searchParams.get('sso_error')
    } catch {
      return undefined
    }
  }
  if (
    candidate === 'access_denied' ||
    candidate === 'service_unavailable' ||
    candidate === 'login_failed' ||
    candidate === 'authorization_cancelled'
  )
    return candidate
  return undefined
}

export function isFirstPartyOAuthAuthorization(
  details: Pick<OAuthAuthorizationDetails, 'client' | 'redirect_uri' | 'scope'>,
  clients: readonly FirstPartyOAuthClient[]
): boolean {
  const requestedScopes = details.scope.split(' ').filter(Boolean)
  // Auth validates redirect_uri against the client's registered allowlist before
  // returning these details. Deployment addresses therefore belong to Auth/BFF
  // configuration, rather than a second callback list in the identity UI.
  let callback: URL
  try {
    callback = new URL(resolveOAuthAuthorizationRedirect(details.redirect_uri))
  } catch {
    return false
  }
  const localDevelopment =
    callback.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname)
  if (callback.protocol !== 'https:' && !localDevelopment) return false
  return clients.some(
    (client) =>
      client.clientId === details.client.id &&
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
