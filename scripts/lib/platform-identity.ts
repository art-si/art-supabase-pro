import { spawn } from 'node:child_process'

/** Tokens travel over stdin so process listings cannot reveal them. Uses the host's proxy configuration. */
export function callPlatformIdentity(
  base: string,
  apiKey: string,
  token: string,
  route: string,
  body?: object,
  env: NodeJS.ProcessEnv = process.env,
  tenantScope?: string
): Promise<unknown> {
  if (!/^[A-Za-z\d._-]+$/.test(token)) return Promise.reject(new Error('请先登录平台账号'))
  return new Promise((resolve, reject) => {
    const args = [
      '--silent',
      '--show-error',
      '--fail-with-body',
      '--connect-timeout',
      '5',
      '--max-time',
      '12',
      '--header',
      '@-'
    ]
    if (body) args.push('--request', 'POST', '--data', JSON.stringify(body))
    args.push(`${base}${route}`)
    const child = spawn(process.platform === 'win32' ? 'curl.exe' : 'curl', args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
      env
    })
    let output = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk
      if (output.length > 2_000_000) child.kill()
    })
    child.on('error', () => reject(new Error('无法验证平台身份，请检查 curl、网络和代理设置')))
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('平台身份验证失败，请重新登录并检查执行端网络'))
        return
      }
      try {
        resolve(JSON.parse(output))
      } catch {
        reject(new Error('身份服务返回无效结果，请稍后重试'))
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
