import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

test(
  '运维 HTTP 接口保留登录过期、权限拒绝和网络故障状态，认证失败不启动任务',
  {
    timeout: 60_000
  },
  async () => {
    const parent = path.resolve('.artifacts/supabase-operations/runtime-tests')
    await mkdir(parent, { recursive: true })
    const root = await mkdtemp(path.join(parent, 'auth-'))
    await mkdir(path.join(root, 'scripts'))
    await mkdir(path.join(root, 'supabase'))
    await writeFile(path.join(root, 'supabase/operations-task.ps1'), 'throw "Must not execute"')
    const identityUrl = pathToFileURL(path.resolve('scripts/lib/platform-identity.ts')).href
    await writeFile(
      path.join(root, 'scripts/identity.ts'),
      `
    import { PlatformIdentityError } from ${JSON.stringify(identityUrl)}
    export { PlatformIdentityError }
    export async function callPlatformIdentity(_base, _key, token, route) {
      if (token === 'expired') throw new PlatformIdentityError('平台登录已失效，请重新登录后重试', 401, 'PLATFORM_AUTH_REQUIRED')
      if (token === 'offline') throw new PlatformIdentityError('无法连接平台身份服务，请检查执行端网络和代理后重试', 503, 'PLATFORM_IDENTITY_UNAVAILABLE')
      if (route === '/rest/v1/rpc/current_is_super') return token !== 'ordinary'
      if (route === '/rest/v1/rpc/current_has_permission') return token !== 'denied'
      return { id: 'isolated-actor' }
    }
  `
    )
    let source = await readFile('scripts/supabase-operations.ts', 'utf8')
    for (const specifier of [
      './supabase-operations-runtime',
      './supabase-operations-inspection',
      '../src/utils/supabase/operations-catalog'
    ]) {
      source = source.replaceAll(
        `'${specifier}'`,
        JSON.stringify(pathToFileURL(path.resolve('scripts', `${specifier}.ts`)).href)
      )
    }
    source = source.replaceAll("'./lib/platform-identity'", "'./identity'")
    const entry = path.join(root, 'scripts/supabase-operations.ts')
    await writeFile(entry, source)
    const probe = createServer()
    probe.listen(0, '127.0.0.1')
    await once(probe, 'listening')
    const address = probe.address()
    assert.ok(address && typeof address === 'object')
    await new Promise<void>((resolve) => probe.close(() => resolve()))
    const child = spawn(process.execPath, ['--import', 'tsx', entry], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SUPABASE_OPS_PORT: String(address.port),
        VITE_SUPABASE_URL: 'https://ckbftoopuyophiebamwy.supabase.co',
        VITE_SUPABASE_KEY: 'isolated-public-key'
      }
    })
    let diagnostic = ''
    child.stdout.on('data', (chunk: Buffer) => {
      diagnostic += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      diagnostic += chunk.toString()
    })
    const closed = once(child, 'close')
    try {
      let ready = false
      for (let attempt = 0; attempt < 200; attempt++) {
        if (child.exitCode !== null) assert.fail(diagnostic)
        try {
          await readFile(path.join(root, '.artifacts/supabase-operations/connection.json'))
          ready = true
          break
        } catch {
          await delay(100)
        }
      }
      assert.ok(ready, diagnostic)
      const request = (token?: string, post = true) =>
        fetch(`http://127.0.0.1:${address.port}/runs`, {
          method: post ? 'POST' : 'GET',
          headers: {
            Origin: 'http://127.0.0.1:3006',
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          ...(post
            ? { body: JSON.stringify({ operationId: 'updateBackup', parameters: {} }) }
            : {}),
          signal: AbortSignal.timeout(5000)
        })
      for (const [token, status, code] of [
        [undefined, 401, 'PLATFORM_AUTH_REQUIRED'],
        ['expired', 401, 'PLATFORM_AUTH_REQUIRED'],
        ['offline', 503, 'PLATFORM_IDENTITY_UNAVAILABLE'],
        ['ordinary', 403, 'PLATFORM_PERMISSION_DENIED'],
        ['denied', 403, 'PLATFORM_PERMISSION_DENIED']
      ] as const) {
        const response = await request(token)
        assert.equal(response.status, status)
        assert.equal((await response.json()).code, code)
      }
      const response = await request('allowed', false)
      assert.equal(response.status, 200)
      const snapshot = await response.json()
      assert.deepEqual(snapshot.runs, [])
      assert.equal(snapshot.busy, false)
    } finally {
      child.kill()
      await closed
      assert.equal(path.dirname(root), parent)
      await rm(root, { recursive: true, force: true })
    }
  }
)
