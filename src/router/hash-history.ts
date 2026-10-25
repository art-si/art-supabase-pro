interface HashRouterLocation {
  origin: string
  pathname: string
  search: string
  hash: string
}

/**
 * 将从非部署根路径打开的 Hash 应用收敛到固定 base，保留当前查询参数和 Hash 路由。
 */
export function resolveCanonicalHashRouterUrl(
  base: string,
  location: HashRouterLocation
): string | undefined {
  const basePath = new URL(base, location.origin).pathname
  if (location.pathname === basePath) return undefined

  return `${basePath}${location.search}${location.hash}`
}

export function normalizeHashRouterBase(base: string): void {
  const targetUrl = resolveCanonicalHashRouterUrl(base, window.location)
  if (!targetUrl) return

  window.history.replaceState(window.history.state, '', targetUrl)
}
