import { supabase } from '@/plugins/supabase'

async function loopbackPermissionDenied(): Promise<boolean> {
  if (!navigator.permissions) return false
  for (const name of ['loopback-network', 'local-network-access']) {
    try {
      // Chromium local-network permission names are not yet included in TypeScript's DOM types.
      const permission = await navigator.permissions.query({ name } as PermissionDescriptor)
      if (permission.state === 'denied') return true
    } catch {
      /* Unsupported browsers rely on the fetch error below. */
    }
  }
  return false
}

/** Shared authenticated transport for independently running, origin-restricted execution services. */
export async function requestLocalExecutor(
  base: string,
  route: string,
  body?: unknown,
  tenantScope?: string
): Promise<unknown> {
  const endpoint = new URL(base)
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== '/' ||
    (endpoint.protocol !== 'https:' &&
      !(
        endpoint.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)
      ))
  )
    throw new Error('执行端地址须为 HTTPS 地址，或本机 HTTP 地址；不能包含路径或密码')
  const trusted = String(import.meta.env.VITE_SQL_GATEWAY_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  if (!local && !trusted.includes(endpoint.origin))
    throw new Error('远程执行端未列入应用可信地址，请由管理员配置 VITE_SQL_GATEWAY_ORIGINS 后重试')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new Error('请先登录项目账号，再连接执行端')
  let response: Response
  try {
    const request: RequestInit & { targetAddressSpace?: 'loopback' } = {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json',
        ...(tenantScope ? { 'x-art-tenant-scope': tenantScope } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(45000)
    }
    if (local) request.targetAddressSpace = 'loopback'
    response = await fetch(`${endpoint.origin}${route}`, request)
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'TimeoutError')
      throw new Error('执行端响应超时，请确认服务仍在运行后重试', { cause })
    if (await loopbackPermissionDenied())
      throw new Error('浏览器已阻止本机网络访问，请在地址栏的站点设置中允许“本地网络访问”后重试', {
        cause
      })
    throw new Error('无法连接执行端，请检查服务是否启动、地址及网络设置后重试', { cause })
  }
  const result: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      result &&
      typeof result === 'object' &&
      'message' in result &&
      typeof result.message === 'string' &&
      /[\u4e00-\u9fff]/.test(result.message)
        ? result.message
        : '执行端请求失败，请检查服务后重试'
    throw new Error(message)
  }
  return result
}
