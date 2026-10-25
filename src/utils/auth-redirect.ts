/**
 * 校验统一登录后的回跳地址。
 *
 * 平台内部路由使用相对地址；独立业务应用仅允许回跳到与平台同 origin 的完整 URL。
 * 这样可以支持 GitHub Pages 子路径部署，同时阻止开放重定向和令牌跨域泄露。
 */
export function resolveSafePostLoginRedirect(
  requestedRedirect: string | undefined,
  platformOrigin: string
): string | undefined {
  if (!requestedRedirect) return undefined

  if (requestedRedirect.startsWith('/') && !requestedRedirect.startsWith('//')) {
    return requestedRedirect
  }

  try {
    const target = new URL(requestedRedirect)
    return target.origin === platformOrigin ? target.href : undefined
  } catch {
    return undefined
  }
}

export function isAbsoluteApplicationRedirect(target: string): boolean {
  return /^https?:\/\//i.test(target)
}
