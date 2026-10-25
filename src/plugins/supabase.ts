import cloudbase from '@cloudbase/js-sdk'
import type { ICloudbaseRequest } from '@cloudbase/js-sdk/types/request'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseApi } from '@/config/api-provider'
import { isCloudBaseBaas } from '@/config/baas-provider'
import {
  normalizePlatformTenantReadUrl,
  readPlatformTenantScopeActive,
  readMutationTenantScopeId,
  readTenantScopeId,
  shouldAttachTenantScopeHeader,
  CLOUDBASE_TENANT_SCOPE_HEADER,
  TENANT_SCOPE_HEADER
} from '@/utils/tenant-scope-context'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost'
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || 'java-api-provider'
const tenantScopeHeader = isCloudBaseBaas ? CLOUDBASE_TENANT_SCOPE_HEADER : TENANT_SCOPE_HEADER
if (
  isSupabaseApi &&
  !isCloudBaseBaas &&
  (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_KEY)
) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY')
}

const tenantScopeFetch: typeof fetch = async (input, init) => {
  const selectedTenantScopeId = readTenantScopeId()
  const requestUrl = input instanceof Request ? input.url : String(input)
  const requestMethod = (
    init?.method ?? (input instanceof Request ? input.method : 'GET')
  ).toUpperCase()
  const isDataApiRequest = shouldAttachTenantScopeHeader(requestUrl)
  const isPlatformScopeActive = readPlatformTenantScopeActive()
  const isReadRequest = requestMethod === 'GET' || requestMethod === 'HEAD'
  const shouldNormalizeRead = isPlatformScopeActive && isReadRequest && isDataApiRequest
  const mutationTenantScopeId =
    isPlatformScopeActive && !isReadRequest && isDataApiRequest
      ? readMutationTenantScopeId(
          init?.body ?? (input instanceof Request ? await input.clone().text() : null)
        )
      : null
  const tenantScopeId = selectedTenantScopeId ?? mutationTenantScopeId
  const normalizedUrl = shouldNormalizeRead
    ? normalizePlatformTenantReadUrl(requestUrl)
    : requestUrl

  if (!tenantScopeId || !isDataApiRequest) {
    if (normalizedUrl === requestUrl) return fetch(input, init)
    const normalizedInput =
      input instanceof Request ? new Request(normalizedUrl, input) : normalizedUrl
    return fetch(normalizedInput, init)
  }

  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
  headers.set(tenantScopeHeader, tenantScopeId)

  const normalizedInput =
    input instanceof Request ? new Request(normalizedUrl, input) : normalizedUrl
  return fetch(normalizedInput, { ...init, headers })
}

const createCloudBaseClient = (): SupabaseClient => {
  const environmentId = import.meta.env.VITE_CLOUDBASE_ENV_ID?.trim()
  const accessKey = import.meta.env.VITE_CLOUDBASE_PUBLISHABLE_KEY?.trim()
  const httpOrigin = import.meta.env.VITE_CLOUDBASE_HTTP_ORIGIN?.trim().replace(/\/+$/u, '')
  const edgeOrigin = import.meta.env.VITE_CLOUDBASE_EDGE_ORIGIN?.trim()
  if (!environmentId) throw new Error('Missing VITE_CLOUDBASE_ENV_ID')
  if (!accessKey) throw new Error('Missing VITE_CLOUDBASE_PUBLISHABLE_KEY')
  if (!httpOrigin) throw new Error('Missing VITE_CLOUDBASE_HTTP_ORIGIN')
  if (!edgeOrigin) throw new Error('Missing VITE_CLOUDBASE_EDGE_ORIGIN')

  const app = cloudbase.init({
    env: environmentId,
    region: import.meta.env.VITE_CLOUDBASE_REGION?.trim() || 'ap-shanghai',
    ...(accessKey ? { accessKey } : {}),
    auth: { detectSessionInUrl: true }
  })
  const auth = typeof app.auth === 'function' ? app.auth({ persistence: 'local' }) : app.auth

  const requestApp = app as typeof app & { request: ICloudbaseRequest }
  const cloudBaseFetch = requestApp.request.fetch.bind(requestApp.request)
  requestApp.request.fetch = async (options) => {
    const requestUrl = String(options.url ?? '')
    if (!shouldAttachTenantScopeHeader(requestUrl)) return cloudBaseFetch(options)

    const requestMethod = String(options.method ?? 'GET').toUpperCase()
    const isReadRequest = requestMethod === 'GET' || requestMethod === 'HEAD'
    const isPlatformScopeActive = readPlatformTenantScopeActive()
    const normalizedUrl =
      isPlatformScopeActive && isReadRequest
        ? normalizePlatformTenantReadUrl(requestUrl)
        : requestUrl
    const requestBody =
      typeof options.body === 'string'
        ? options.body
        : options.body == null
          ? null
          : JSON.stringify(options.body)
    const tenantScopeId =
      readTenantScopeId() ??
      (isPlatformScopeActive && !isReadRequest ? readMutationTenantScopeId(requestBody) : null)
    if (!tenantScopeId && normalizedUrl === requestUrl) return cloudBaseFetch(options)

    return cloudBaseFetch({
      ...options,
      url: normalizedUrl,
      headers: {
        ...options.headers,
        ...(tenantScopeId ? { [tenantScopeHeader]: tenantScopeId } : {})
      }
    })
  }

  const gatewayOrigin = `https://${environmentId}.api.tcloudbasegateway.com`
  const cloudBasePostgrestFetch: typeof fetch = async (input, init) => {
    const requestUrl = new URL(input instanceof Request ? input.url : String(input))
    if (requestUrl.pathname === '/rest/v1' || requestUrl.pathname.startsWith('/rest/v1/')) {
      requestUrl.pathname = `/v1/rdb/rest${requestUrl.pathname.slice('/rest/v1'.length)}`
    }
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
    const session = await auth.getSession()
    headers.set('apikey', accessKey)
    headers.set('Authorization', `Bearer ${session.data?.session?.access_token || accessKey}`)
    const rewrittenInput =
      input instanceof Request ? new Request(requestUrl, input) : requestUrl.toString()
    return tenantScopeFetch(rewrittenInput, { ...init, headers })
  }
  const database = createClient(gatewayOrigin, accessKey, {
    global: { fetch: cloudBasePostgrestFetch },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  })
  let realtime: ReturnType<typeof app.realtime> | null = null
  const getRealtime = () => (realtime ??= app.realtime())
  const functions = {
    async invoke<T>(
      functionName: string,
      options?: { body?: unknown; headers?: Record<string, string>; method?: string }
    ): Promise<{ data: T | null; error: Error | null }> {
      try {
        if (functionName === 'migrate-supabase-login') {
          const response = await fetch(`${httpOrigin}/login-migrate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(accessKey ? { Authorization: `Bearer ${accessKey}` } : {})
            },
            body: JSON.stringify(options?.body ?? {})
          })
          const result = (await response.json().catch(() => null)) as T | null
          if (!response.ok && !result) throw new Error('CloudBase login migration failed')
          return { data: result, error: null }
        }
        const session = await auth.getSession()
        const bearerToken = session.data?.session?.access_token || accessKey
        const response = await fetch(
          `${edgeOrigin}${edgeOrigin.includes('?') ? '&' : '?'}function=${encodeURIComponent(functionName)}`,
          {
            method: options?.method || 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
              ...options?.headers
            },
            body: JSON.stringify(options?.body ?? {})
          }
        )
        const result = (await response.json().catch(() => null)) as T | null
        if (!response.ok) {
          return {
            data: null,
            error: new Error(
              result && typeof result === 'object' && 'error' in result
                ? String(result.error)
                : 'CloudBase function invocation failed'
            )
          }
        }
        return { data: result, error: null }
      } catch (error) {
        return {
          data: null,
          error: error instanceof Error ? error : new Error('CloudBase function invocation failed')
        }
      }
    }
  }

  return new Proxy(database, {
    get(target, property, receiver) {
      if (property === 'auth') return auth
      if (property === 'storage') return app.storage
      if (property === 'functions') return functions
      if (property === 'channel') return getRealtime().channel.bind(getRealtime())
      if (property === 'removeChannel') return getRealtime().removeChannel.bind(getRealtime())
      if (property === 'removeAllChannels')
        return getRealtime().removeAllChannels.bind(getRealtime())
      const value = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    }
  }) as SupabaseClient
}

export const supabase = isCloudBaseBaas
  ? createCloudBaseClient()
  : createClient(supabaseUrl, supabaseKey, {
      global: { fetch: tenantScopeFetch },
      auth: {
        // OAuth 与密码找回使用查询参数中的一次性授权码，避免 implicit token fragment
        // 和 Vue Hash 路由同时占用 `#`，造成回调后无法恢复 Supabase 会话。
        detectSessionInUrl: true,
        flowType: 'pkce'
      }
    })
