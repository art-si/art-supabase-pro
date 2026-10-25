import { uniqBy } from 'lodash-es'

const BUILTIN_PROVIDERS = new Set([
  'apple',
  'azure',
  'bitbucket',
  'discord',
  'facebook',
  'figma',
  'github',
  'gitlab',
  'google',
  'kakao',
  'keycloak',
  'linkedin',
  'linkedin_oidc',
  'notion',
  'slack',
  'slack_oidc',
  'spotify',
  'twitch',
  'twitter',
  'workos',
  'x',
  'zoom'
])

const SAFE_KEY = /^[a-z][a-z0-9_-]{1,39}$/
const SAFE_CUSTOM_PROVIDER = /^custom:[a-z0-9][a-z0-9:-]{0,42}[a-z0-9]$/
const SAFE_QUERY_PARAM = /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/
const SAFE_ICON = /^[a-z0-9-]+:[a-z0-9-]+$/

const readText = (value: unknown, maxLength: number): string =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export const AUTH_CHANNEL_PRESETS: Api.Auth.AuthChannel[] = [
  {
    key: 'wechat',
    label: '微信',
    provider: 'custom:wechat',
    icon: 'ri:wechat-fill',
    description: '使用微信扫码登录',
    scopes: 'snsapi_login',
    enabled: false,
    allowLinking: true
  },
  {
    key: 'dingtalk',
    label: '钉钉',
    provider: 'custom:dingtalk',
    icon: 'ri:dingding-fill',
    description: '使用钉钉扫码或企业免登',
    enabled: false,
    allowLinking: true
  },
  {
    key: 'wecom',
    label: '企业微信',
    provider: 'custom:wecom',
    icon: 'ri:wechat-2-fill',
    description: '使用企业微信身份登录',
    enabled: false,
    allowLinking: true
  },
  {
    key: 'feishu',
    label: '飞书',
    provider: 'custom:feishu',
    icon: 'ri:building-2-line',
    description: '使用飞书企业身份登录',
    scopes: 'contact:user.base:readonly contact:user.email:readonly',
    enabled: false,
    allowLinking: true
  },
  {
    key: 'google',
    label: 'Google',
    provider: 'google',
    icon: 'ri:google-fill',
    description: '使用 Google 账号登录',
    enabled: false,
    allowLinking: true
  },
  {
    key: 'microsoft',
    label: 'Microsoft',
    provider: 'azure',
    icon: 'ri:microsoft-fill',
    description: '使用 Microsoft 企业账号登录',
    enabled: false,
    allowLinking: true
  },
  {
    key: 'github',
    label: 'GitHub',
    provider: 'github',
    icon: 'ri:github-fill',
    description: '使用 GitHub 账号登录',
    enabled: false,
    allowLinking: true
  }
]

export function isSupportedAuthProvider(provider: string): boolean {
  return BUILTIN_PROVIDERS.has(provider) || SAFE_CUSTOM_PROVIDER.test(provider)
}

export function normalizeAuthChannels(value: unknown): Api.Auth.AuthChannel[] {
  if (!Array.isArray(value)) return []

  const channels = value.flatMap((item): Api.Auth.AuthChannel[] => {
    if (!isRecord(item)) return []

    const key = readText(item.key, 40).toLowerCase()
    const label = readText(item.label, 40)
    const provider = readText(item.provider, 50).toLowerCase()
    if (!SAFE_KEY.test(key) || !label || !isSupportedAuthProvider(provider)) return []

    const icon = readText(item.icon, 80).toLowerCase()
    const queryParamName = readText(item.queryParamName, 64)
    const queryParamValue = readText(item.queryParamValue, 160)

    return [
      {
        key,
        label,
        provider,
        icon: SAFE_ICON.test(icon) ? icon : 'ri:login-circle-line',
        description: readText(item.description, 100) || null,
        scopes: readText(item.scopes, 200) || null,
        queryParamName:
          queryParamName && SAFE_QUERY_PARAM.test(queryParamName) ? queryParamName : null,
        queryParamValue: queryParamName && queryParamValue ? queryParamValue : null,
        enabled: item.enabled === true,
        allowLinking: item.allowLinking !== false
      }
    ]
  })

  return uniqBy(channels, (channel) => channel.key).slice(0, 20)
}

export function getAuthChannelValidationMessage(value: unknown): string | null {
  if (!Array.isArray(value)) return '认证渠道配置格式无效'
  if (value.length > 20) return '认证渠道最多配置 20 个'

  const seenKeys = new Set<string>()
  const seenProviders = new Set<string>()
  for (const item of value) {
    if (!isRecord(item)) return '认证渠道包含无效记录'
    const key = readText(item.key, 40).toLowerCase()
    const label = readText(item.label, 40)
    const provider = readText(item.provider, 50).toLowerCase()
    if (!SAFE_KEY.test(key)) return '渠道标识需以小写字母开头，只能包含字母、数字、下划线和短横线'
    if (seenKeys.has(key)) return `渠道标识“${key}”重复`
    if (!label) return `渠道“${key}”缺少显示名称`
    if (!isSupportedAuthProvider(provider)) {
      return `渠道“${label}”的 Provider 无效，请填写 Supabase 内置名称或 custom: 开头的标识`
    }
    if (seenProviders.has(provider)) {
      return `Provider“${provider}”已被其他渠道使用；同一 Provider 请只配置一个登录入口`
    }
    const paramName = readText(item.queryParamName, 64)
    const paramValue = readText(item.queryParamValue, 160)
    if (paramName && !SAFE_QUERY_PARAM.test(paramName)) return `渠道“${label}”的授权参数名无效`
    if (paramName && !paramValue) return `渠道“${label}”缺少授权参数值`
    seenKeys.add(key)
    seenProviders.add(provider)
  }
  return null
}

export function buildAuthCallbackUrl(
  baseUrl: string,
  path: string,
  action: 'login' | 'link',
  channelKey: string,
  redirect?: string
): string {
  const url = new URL(baseUrl)
  url.search = ''
  const params = new URLSearchParams({ auth_action: action, channel: channelKey })
  if (redirect) params.set('redirect', redirect)
  url.hash = `${path}?${params.toString()}`
  return url.href
}

export function getAuthChannelQueryParams(
  channel: Api.Auth.AuthChannel
): Record<string, string> | undefined {
  if (!channel.queryParamName || !channel.queryParamValue) return undefined
  return { [channel.queryParamName]: channel.queryParamValue }
}
