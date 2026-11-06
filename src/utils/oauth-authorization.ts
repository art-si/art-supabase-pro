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
