import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

export class PlatformIdentityError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 503,
    readonly code:
      'PLATFORM_AUTH_REQUIRED' | 'PLATFORM_PERMISSION_DENIED' | 'PLATFORM_IDENTITY_UNAVAILABLE',
    options?: ErrorOptions
  ) {
    super(message, options)
  }
}

const unavailable = (
  message = '无法连接平台身份服务，请检查执行端网络和代理后重试',
  cause?: unknown
) => new PlatformIdentityError(message, 503, 'PLATFORM_IDENTITY_UNAVAILABLE', { cause })

/** Windows keeps its desktop proxy outside the environment variables read by curl. */
export function parseWindowsIdentityProxy(settings: string): string | undefined {
  if (!/^\s*ProxyEnable\s+REG_DWORD\s+0x1\s*$/im.test(settings)) return undefined
  const server = settings.match(/^\s*ProxyServer\s+REG_SZ\s+([^\r\n]+)/im)?.[1].trim()
  if (!server) return undefined
  const address = server.includes('=')
    ? server
        .split(';')
        .find((entry) => /^https=/i.test(entry.trim()))
        ?.trim()
        .slice(6)
    : server
  if (!address) return undefined
  try {
    const proxy = new URL(address.includes('://') ? address : `http://${address}`)
    return ['http:', 'https:'].includes(proxy.protocol) && proxy.hostname ? proxy.origin : undefined
  } catch {
    return undefined
  }
}

async function identityEnvironment(env: NodeJS.ProcessEnv): Promise<NodeJS.ProcessEnv> {
  if (
    process.platform !== 'win32' ||
    ['https_proxy', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY'].some((key) => env[key])
  )
    return env
  try {
    const { stdout } = await promisify(execFile)(
      'reg.exe',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],
      { env, windowsHide: true, timeout: 3000, maxBuffer: 128000 }
    )
    const proxy = parseWindowsIdentityProxy(stdout)
    return proxy ? { ...env, HTTPS_PROXY: proxy } : env
  } catch (cause) {
    // Profiles without Internet Settings (for example service accounts) use curl's direct connection.
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 1) return env
    throw new PlatformIdentityError(
      '无法读取执行端代理设置，请配置 HTTPS_PROXY 后重试',
      503,
      'PLATFORM_IDENTITY_UNAVAILABLE',
      { cause }
    )
  }
}

/** Tokens travel over stdin so process listings cannot reveal them. Uses the host's proxy configuration. */
export async function callPlatformIdentity(
  base: string,
  apiKey: string,
  token: string,
  route: string,
  body?: object,
  env: NodeJS.ProcessEnv = process.env,
  tenantScope?: string
): Promise<unknown> {
  if (!/^[A-Za-z\d._-]+$/.test(token))
    throw new PlatformIdentityError('请先登录平台账号', 401, 'PLATFORM_AUTH_REQUIRED')
  const requestEnv = await identityEnvironment(env)
  return new Promise((resolve, reject) => {
    const args = [
      '--silent',
      '--show-error',
      '--write-out',
      '\n%{http_code}',
      '--connect-timeout',
      '10',
      '--max-time',
      '15',
      '--header',
      '@-'
    ]
    if (body) args.push('--request', 'POST', '--data', JSON.stringify(body))
    args.push(`${base}${route}`)
    const child = spawn(process.platform === 'win32' ? 'curl.exe' : 'curl', args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
      env: requestEnv
    })
    let output = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk
      if (output.length > 2_000_000) child.kill()
    })
    child.on('error', (cause) =>
      reject(unavailable('无法验证平台身份，请检查 curl、网络和代理设置', cause))
    )
    child.on('close', (code) => {
      if (code !== 0) {
        reject(unavailable(undefined, { exitCode: code }))
        return
      }
      const separator = output.lastIndexOf('\n')
      const status = Number(output.slice(separator + 1))
      if (status === 401 || (route === '/auth/v1/user' && [400, 403].includes(status))) {
        reject(
          new PlatformIdentityError(
            '平台登录已失效，请重新登录后重试',
            401,
            'PLATFORM_AUTH_REQUIRED'
          )
        )
        return
      }
      if (status === 403) {
        reject(
          new PlatformIdentityError(
            '当前账号无权执行此操作，请联系管理员',
            403,
            'PLATFORM_PERMISSION_DENIED'
          )
        )
        return
      }
      if (status < 200 || status >= 300) {
        reject(unavailable('平台身份服务暂不可用，请稍后重试', { httpStatus: status }))
        return
      }
      try {
        resolve(JSON.parse(output.slice(0, separator)))
      } catch {
        reject(unavailable('身份服务返回无效结果，请稍后重试'))
      }
    })
    child.stdin.on('error', () => {
      /* close/error reports the failed authentication request. */
    })
    child.stdin.end(
      `apikey: ${apiKey}\nAuthorization: Bearer ${token}\nContent-Type: application/json\n${tenantScope ? `x-art-tenant-scope: ${tenantScope}\n` : ''}`
    )
  })
}
