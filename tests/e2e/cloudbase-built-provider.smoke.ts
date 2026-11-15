import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium, expect, type Browser, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { preview } from 'vite'

// Run with pnpm exec tsx tests/e2e/cloudbase-built-provider.smoke.ts <outDir> [<outDir>...]
const base = '/art-supabase-pro/'
const origin = 'http://127.0.0.1:41863'
const authUser = {
  id: '11111111-1111-4111-8111-111111111113',
  uid: '11111111-1111-4111-8111-111111111113',
  email: 'cloudbase-probe@example.invalid',
  username: 'cloudbase-probe@example.invalid',
  role: 'authenticated',
  aud: 'authenticated'
}
const tenantId = '11111111-1111-4111-8111-111111111114'
const password = 'local-only-test-password'
const bucket = 'cloudbase-smoke'
const objectPath = 'fixture.txt'
const signedUrl = `${origin}/mock-storage/${objectPath}`
const topic = 'cloudbase-sdk-smoke'
const channelEvent = 'provider-probe'
const broadcast = { source: 'isolated-test' }

interface CloudBaseStorage {
  from(bucket: string): {
    createSignedUrl(
      object: string,
      expiresIn: number
    ): Promise<{ data: { fullSignedURL: string } | null; error: Error | null }>
  }
}

type CompiledProvider = Pick<SupabaseClient, 'auth' | 'from' | 'channel' | 'removeChannel'> & {
  storage: CloudBaseStorage
}

interface PhoenixFrame {
  event: string
  topic: string
  ref?: string
  join_ref?: string
}

function mockSession() {
  const now = Math.floor(Date.now() / 1000)
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: authUser.id, aud: authUser.aud, role: authUser.role, iat: now, exp: now + 3600 })}.local-proof`
  // The CloudBase SDK derives its expiry Date from expires_in.
  return {
    access_token: accessToken,
    refresh_token: 'isolated-cloudbase-refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: authUser
  }
}

async function findCompiledProvider(outDir: string): Promise<string> {
  const assets = path.join(outDir, 'assets')
  for (const asset of await readdir(assets)) {
    if (!asset.endsWith('.js')) continue
    const content = await readFile(path.join(assets, asset), 'utf8')
    if (content.includes('CloudBase function invocation failed')) return `${base}assets/${asset}`
  }
  throw new Error(`CloudBase provider chunk not found in ${outDir}`)
}

async function inspectProvider(page: Page, asset: string, exerciseCapabilities: boolean) {
  return page.evaluate(
    async ({ asset, exerciseCapabilities, bucket, objectPath, topic, channelEvent }) => {
      const module: Record<string, unknown> = await import(asset)
      // Production names may be mangled. Use the exported provider's public surface.
      const providers = Object.values(module).filter((value): value is CompiledProvider => {
        if (!value || typeof value !== 'object') return false
        const candidate = value as Partial<CompiledProvider>
        return (
          typeof candidate.from === 'function' && typeof candidate.auth?.getSession === 'function'
        )
      })
      if (providers.length !== 1) throw new Error('Expected one compiled CloudBase provider')
      const provider = providers[0]
      const session = await provider.auth.getSession()
      if (session.error) throw session.error
      const userId = session.data.session?.user.id ?? null
      if (!exerciseCapabilities) return { userId }

      const signed = await provider.storage.from(bucket).createSignedUrl(objectPath, 60)
      if (signed.error) throw signed.error
      const channel = provider.channel(topic)
      const received = new Promise<unknown>((resolve) => {
        channel.on('broadcast', { event: channelEvent }, (event) => resolve(event.payload))
      })
      const subscribed = new Promise<string>((resolve) => channel.subscribe(resolve, 5_000))
      let broadcastTimeout: ReturnType<typeof setTimeout> | undefined
      try {
        const status = await subscribed
        if (status !== 'SUBSCRIBED') throw new Error(`CloudBase subscribe returned ${status}`)
        const message = await Promise.race([
          received,
          new Promise<never>((_resolve, reject) => {
            broadcastTimeout = setTimeout(
              () => reject(new Error('CloudBase broadcast timed out')),
              5_000
            )
          })
        ])
        const removed = await provider.removeChannel(channel)
        const logout = await provider.auth.signOut()
        if (logout?.error) throw logout.error
        const afterLogout = await provider.auth.getSession()
        if (afterLogout.error) throw afterLogout.error
        return {
          userId,
          signedUrl: signed.data?.fullSignedURL,
          status,
          message,
          removed,
          signedOut: afterLogout.data.session === null
        }
      } finally {
        clearTimeout(broadcastTimeout)
      }
    },
    { asset, exerciseCapabilities, bucket, objectPath, topic, channelEvent }
  )
}

async function verifyBuild(browser: Browser, output: string) {
  const outDir = path.resolve(output)
  const asset = await findCompiledProvider(outDir)
  const server = await preview({
    configFile: false,
    base,
    build: { outDir },
    preview: { host: '127.0.0.1', port: 41863, strictPort: true }
  })
  try {
    const context = await browser.newContext({ locale: 'zh-CN', serviceWorkers: 'block' })
    try {
      const session = mockSession()
      const signins: unknown[] = []
      const storageRequests: unknown[] = []
      const realtimeEvents: string[] = []
      const logoutRequests: unknown[] = []
      let postgrestSessionUsed = false
      await context.route('**/*', async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        if (url.origin === origin) return route.continue()
        // Every provider HTTP response is synthetic. Other external requests are blocked.
        if (!url.hostname.endsWith('.api.tcloudbasegateway.com'))
          return route.abort('blockedbyclient')
        const headers = {
          'access-control-allow-origin': origin,
          'access-control-allow-credentials': 'true',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': request.headers()['access-control-request-headers'] || '*'
        }
        const reply = (json: unknown) => route.fulfill({ json, headers })
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })

        const routePath = url.pathname
        switch (routePath) {
          case '/auth/v1/signin':
            signins.push(request.postDataJSON())
            return reply(session)
          case '/auth/v1/user/me':
            return reply(authUser)
          case '/auth/v1/revoke':
            logoutRequests.push(request.postDataJSON())
            return reply({})
          case `/v1/storages/object/sign/${bucket}/${objectPath}`:
            storageRequests.push(request.postDataJSON())
            return reply({ fullSignedURL: signedUrl })
          case '/v1/rdb/rest/sys_param':
            if (!url.searchParams.get('param_key')?.includes('website.config')) return reply([])
            return reply({
              id: 'mock-website-config',
              param_key: 'website.config',
              enabled: true,
              param_value: JSON.stringify({ captchaEnabled: false, authChannels: [] })
            })
          case '/v1/rdb/rest/sys_user':
            postgrestSessionUsed ||=
              request.headers().authorization === `Bearer ${session.access_token}`
            return reply({
              id: authUser.id,
              auth_user_id: authUser.id,
              user_name: 'CloudBase Probe',
              user_email: authUser.email,
              status: '1',
              tenant_id: tenantId,
              tenant: { id: tenantId, tenant_code: 'local', tenant_name: 'Local Tenant' }
            })
          case '/v1/rdb/rest/rpc/get_menus_for_current_applications': {
            const { p_app_codes: codes } = request.postDataJSON() as { p_app_codes: string[] }
            const menu = {
              id: 'cloudbase-probe-console',
              parentId: null,
              name: 'CloudBaseProbeConsole',
              path: '/dashboard/console',
              component: '/dashboard/console',
              type: 'menu',
              sort: 1,
              meta: { title: '工作台', is_enable: true, is_hide: false, roles: [] }
            }
            return reply(
              Object.fromEntries(codes.map((code) => [code, code === 'platform' ? [menu] : []]))
            )
          }
          case '/v1/rdb/rest/rpc/current_is_super':
            return reply(false)
          default:
            return routePath.startsWith('/v1/rdb/rest/')
              ? reply([])
              : route.abort('blockedbyclient')
        }
      })
      await context.routeWebSocket('**/*', (socket) => {
        const url = new URL(socket.url())
        if (
          !url.hostname.endsWith('.api.tcloudbasegateway.com') ||
          url.pathname !== '/v1/realtime/websocket'
        ) {
          void socket.close({ code: 1008, reason: 'Unexpected test socket' })
          return
        }
        socket.onMessage((message) => {
          const frame = JSON.parse(message.toString()) as PhoenixFrame
          socket.send(
            JSON.stringify({
              topic: frame.topic,
              event: 'phx_reply',
              payload: { status: 'ok', response: {} },
              ref: frame.ref,
              join_ref: frame.join_ref
            })
          )
          if (frame.topic !== `realtime:${topic}`) return
          realtimeEvents.push(frame.event)
          if (frame.event === 'phx_join') {
            socket.send(
              JSON.stringify({
                topic: frame.topic,
                event: 'broadcast',
                payload: { event: channelEvent, payload: broadcast, type: 'broadcast' },
                ref: null,
                join_ref: frame.join_ref
              })
            )
          }
        })
      })

      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(`${origin}${base}#/auth/login?redirect=/file-preview`)
      assert.deepEqual(await inspectProvider(page, asset, false), { userId: null })
      await page.locator('input[name="username"]').fill(authUser.email)
      await page.getByLabel('登录密码').fill(password)
      await page.getByRole('button', { name: /^登\s*录$/ }).click()
      await expect(page.locator('.art-file-viewer-page')).toBeVisible()
      assert.deepEqual(await inspectProvider(page, asset, false), { userId: authUser.id })

      await page.reload()
      await expect(page.locator('.art-file-viewer-page')).toBeVisible()
      const result = await inspectProvider(page, asset, true)
      assert.deepEqual(result, {
        userId: authUser.id,
        signedUrl,
        status: 'SUBSCRIBED',
        message: broadcast,
        removed: 'ok',
        signedOut: true
      })
      assert.equal(signins.length, 1)
      assert.match(JSON.stringify(signins[0]), /cloudbase-probe@example\.invalid/)
      assert.equal(postgrestSessionUsed, true)
      assert.deepEqual(storageRequests, [{ expiresIn: 60 }])
      assert.deepEqual(realtimeEvents, ['phx_join', 'phx_leave'])
      assert.deepEqual(logoutRequests, [{ token: session.access_token }])
      assert.deepEqual(errors, [])
      return result
    } finally {
      await context.close()
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.httpServer.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

const builds = process.argv.slice(2)
assert.ok(builds.length, 'Pass an existing CloudBase production output directory')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  let baseline: Awaited<ReturnType<typeof verifyBuild>> | undefined
  for (const output of builds) {
    const result = await verifyBuild(browser, output)
    if (baseline) assert.deepEqual(result, baseline)
    baseline = result
    console.log(`${output}: login, persisted session, signed URL, realtime and sign-out passed`)
  }
} finally {
  await browser.close()
}
