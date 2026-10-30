import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import axios, { AxiosHeaders, type AxiosAdapter } from 'axios'
import { createServer, transformWithOxc, type Plugin } from 'vite'

const projectRoot = process.cwd()

test('provider resolver keeps canonical, normalized, and fallback selections', async () => {
  const filename = path.join(projectRoot, 'src/config/api-provider.ts')
  const source = readFileSync(filename, 'utf8')
  for (const [raw, expected] of [
    ['supabase', 'supabase'],
    ['java', 'java'],
    [' JAVA ', 'java'],
    [' SuPaBaSe ', 'supabase'],
    ['unrecognized', 'supabase'],
    ['', 'supabase'],
    [undefined, 'supabase'],
    [null, 'supabase'],
    [42, 'supabase']
  ] as const) {
    const transformed = await transformWithOxc(source, filename, {
      lang: 'ts',
      define: {
        'import.meta.env.VITE_API_PROVIDER': raw === undefined ? 'undefined' : JSON.stringify(raw)
      }
    })
    const url = `data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`
    const selected = (await import(url)) as {
      apiProvider: string
      isJavaApi: boolean
      isSupabaseApi: boolean
    }
    assert.equal(selected.apiProvider, expected, raw)
    assert.equal(selected.isJavaApi, expected === 'java', raw)
    assert.equal(selected.isSupabaseApi, expected === 'supabase', raw)
  }
})

test('HTTP client retains Axios request, response, and feedback behavior', async () => {
  const messages = { success: [] as string[], error: [] as string[] }
  const globals = ['__httpTestStore', '__httpTestAxios', 'ElMessage'] as const
  const priorGlobals = globals.map((name) => Object.getOwnPropertyDescriptor(globalThis, name))
  const priorAdapter = axios.defaults.adapter
  const priorConsoleError = console.error
  const requests: Array<{
    method?: string
    url?: string
    authorization?: string
    data?: unknown
    params?: unknown
  }> = []
  let status = 200
  let payload: unknown = { code: 200, msg: '已保存', data: { id: 'record-1' } }

  const adapter: AxiosAdapter = async (config) => {
    requests.push({
      method: config.method,
      url: config.url,
      authorization: config.headers.get('Authorization')?.toString(),
      data: config.data,
      params: config.params
    })
    return {
      config,
      status,
      statusText: status === 204 ? 'No Content' : 'OK',
      headers: new AxiosHeaders({ 'content-type': 'application/json' }),
      data: status === 204 ? '' : JSON.stringify(payload)
    }
  }

  const stubs: Record<string, string> = {
    '@/store/modules/user': 'export const useUserStore = () => globalThis.__httpTestStore',
    '@/locales': 'export const $t = (key) => key',
    '@/config/api-provider': 'export const isSupabaseApi = false',
    '@/utils/supabase': `
      export const isSupabaseSessionFailure = () => false
      export const markErrorAsUserNotified = (error) => error
      export const getFriendlySupabaseErrorMessage = (value, fallback) => {
        const candidate = Array.isArray(value) ? value.at(-1) : value
        return candidate instanceof Error ? candidate.message : fallback
      }
    `,
    '@/utils/supabase/session': `
      export const refreshSupabaseSessionOnce = async () => false
      export const isSupabaseSessionConfirmedExpired = async () => false
      export const notifySupabaseSessionExpired = async () => undefined
    `,
    '../supabase/error': `
      export const getFriendlySupabaseErrorMessage = (value, fallback) =>
        value instanceof Error ? value.message : fallback
    `,
    axios: 'export default globalThis.__httpTestAxios'
  }
  const stubPlugin: Plugin = {
    name: 'http-client-contract-stubs',
    enforce: 'pre',
    resolveId(id) {
      if (id in stubs) return `\0http-contract:${id}`
    },
    load(id) {
      if (id.startsWith('\0http-contract:')) return stubs[id.slice('\0http-contract:'.length)]
    }
  }

  const server = await createServer({
    configFile: false,
    root: projectRoot,
    mode: 'e2e',
    logLevel: 'silent',
    plugins: [stubPlugin],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, hmr: false }
  })
  try {
    Reflect.set(globalThis, '__httpTestStore', { accessToken: 'Bearer test-token', isLogin: true })
    Reflect.set(globalThis, '__httpTestAxios', axios)
    Reflect.set(globalThis, 'ElMessage', {
      success: (message: string) => messages.success.push(message),
      error: (message: string) => messages.error.push(message)
    })
    axios.defaults.adapter = adapter
    console.error = () => undefined
    const { default: http } = (await server.ssrLoadModule('/src/utils/http/index.ts')) as {
      default: typeof import('../../src/utils/http/index').default
    }
    const saved = await http.post<{ id: string }>({
      url: '/records',
      params: { id: 'record-1' },
      showSuccessMessage: true
    })
    assert.deepEqual(saved, { id: 'record-1' })
    assert.deepEqual(requests[0], {
      method: 'post',
      url: '/records',
      authorization: 'Bearer test-token',
      data: JSON.stringify({ id: 'record-1' }),
      params: undefined
    })
    assert.deepEqual(messages.success, ['已保存'])

    payload = { status: 0, message: '读取完成', result: { count: 2 } }
    assert.deepEqual(
      await http.get<{ count: number }>({
        url: '/records',
        skipAuth: true,
        responseContract: {
          codeField: 'status',
          messageField: 'message',
          dataField: 'result',
          successCodes: [0]
        }
      }),
      { count: 2 }
    )
    assert.equal(requests[1].authorization, undefined)

    payload = { raw: true }
    assert.deepEqual(await http.get({ url: '/raw', skipResponseWrapper: true }), payload)
    status = 204
    assert.equal(await http.del({ url: '/records/record-1' }), undefined)

    status = 200
    payload = { code: 409, msg: '单据已被修改', data: null }
    await assert.rejects(http.get({ url: '/conflict' }), (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal(error.message, '单据已被修改')
      return true
    })
    assert.deepEqual(messages.error, ['单据已被修改'])
    await assert.rejects(http.get({ url: '/conflict', showErrorMessage: false }))
    assert.equal(messages.error.length, 1)
  } finally {
    try {
      await server.close()
    } finally {
      axios.defaults.adapter = priorAdapter
      console.error = priorConsoleError
      globals.forEach((name, index) => {
        const descriptor = priorGlobals[index]
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else Reflect.deleteProperty(globalThis, name)
      })
    }
  }
})
