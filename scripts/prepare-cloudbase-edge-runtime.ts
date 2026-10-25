import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const workspace = process.cwd()
const sourceRoot = path.join(workspace, 'supabase/functions')
const outputRoot = path.join(workspace, '.artifacts/cloudbase/edge-runtime')
const functionRoot = path.join(outputRoot, 'functions')

const entries = await readdir(sourceRoot, { withFileTypes: true })
const functionNames = entries
  .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
  .map((entry) => entry.name)
  .sort()

await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })
await cp(sourceRoot, functionRoot, { recursive: true })

const rewriteRemoteSharedImports = async (directory: string) => {
  const children = await readdir(directory, { withFileTypes: true })
  for (const child of children) {
    const target = path.join(directory, child.name)
    if (child.isDirectory()) {
      await rewriteRemoteSharedImports(target)
      continue
    }
    if (!child.isFile() || !child.name.endsWith('.ts')) continue
    const relativeDirectory = path.relative(functionRoot, directory).replace(/\\/gu, '/')
    const sharedPrefix = relativeDirectory === '_shared' ? './' : '../_shared/'
    const source = await readFile(target, 'utf8')
    const rewritten = source
      .replace(
        /https:\/\/raw\.githubusercontent\.com\/869123771\/art-supabase-pro\/[0-9a-f]+\/supabase\/functions\/_shared\/([^'"\s]+)/gu,
        `${sharedPrefix}$1`
      )
      .replace(/^import\s+['"]jsr:@supabase\/functions-js\/edge-runtime\.d\.ts['"];?\s*$/gmu, '')
      .replace(
        /(['"])(?:jsr:@supabase\/supabase-js@2|npm:@supabase\/supabase-js@2(?:\.35\.0|\.45\.4)?|https:\/\/esm\.sh\/@supabase\/supabase-js@2)\1/gu,
        "'supabase-compat'"
      )
    if (rewritten !== source) await writeFile(target, rewritten, 'utf8')
  }
}

await rewriteRemoteSharedImports(functionRoot)

const router = `
const handlers = new Map<string, (request: Request) => Response | Promise<Response>>()
let registering = ''
const nativeServe = Deno.serve.bind(Deno)
const nativeFetch = globalThis.fetch.bind(globalThis)
const configuredGatewayOrigin = String(Deno.env.get('SUPABASE_URL') || '')
const gatewayOrigin = configuredGatewayOrigin.endsWith('/')
  ? configuredGatewayOrigin.slice(0, -1)
  : configuredGatewayOrigin
const clientId = String(Deno.env.get('CLOUDBASE_CLIENT_ID') || '')
const port = Number(Deno.env.get('PORT') || 9000)

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const originalUrl = input instanceof Request ? input.url : String(input)
  let url: URL
  try {
    url = new URL(originalUrl)
  } catch {
    return nativeFetch(input, init)
  }
  if (url.origin !== gatewayOrigin) return nativeFetch(input, init)
  if (url.pathname === '/auth/v1' || url.pathname.startsWith('/auth/v1/')) {
    if (clientId && !url.searchParams.has('client_id')) url.searchParams.set('client_id', clientId)
  } else if (url.pathname === '/rest/v1' || url.pathname.startsWith('/rest/v1/')) {
    url.pathname = \`/v1/rdb/rest\${url.pathname.slice('/rest/v1'.length)}\`
  } else if (url.pathname.startsWith('/functions/v1/')) {
    const functionName = url.pathname.slice('/functions/v1/'.length).split('/')[0]
    url = new URL(\`http://127.0.0.1:\${port}/\${functionName}\`)
  }
  const request = input instanceof Request ? new Request(url, input) : url
  return nativeFetch(request, init)
}) as typeof fetch

const captureServe = (...args: unknown[]) => {
  const handler = typeof args[0] === 'function' ? args[0] : args[1]
  if (typeof handler !== 'function' || !registering) throw new Error('Invalid Deno.serve registration')
  handlers.set(registering, handler as (request: Request) => Response | Promise<Response>)
  return { finished: Promise.resolve(), ref() {}, unref() {}, shutdown: async () => {} }
}
Object.defineProperty(Deno, 'serve', { configurable: true, value: captureServe })

for (const functionName of ${JSON.stringify(functionNames)}) {
  registering = functionName
  await import(\`./functions/\${functionName}/index.ts\`)
  if (!handlers.has(functionName)) throw new Error(\`Function \${functionName} did not register a handler\`)
}
registering = ''
Object.defineProperty(Deno, 'serve', { configurable: true, value: nativeServe })

nativeServe({ hostname: '0.0.0.0', port }, async (request) => {
  const url = new URL(request.url)
  if (url.pathname === '/health') {
    return Response.json({ ok: true, functions: handlers.size })
  }
  const functionName = url.searchParams.get('function') || url.pathname.split('/').filter(Boolean)[0] || ''
  const handler = handlers.get(functionName)
  if (!handler) return Response.json({ code: 'not_found', error: 'Function not found' }, { status: 404 })
  const routedPath = url.searchParams.get('path')
  const handlerRequest = routedPath
    ? new Request(new URL(routedPath.startsWith('/') ? routedPath : \`/\${routedPath}\`, request.url), request)
    : request
  const result = await handler(handlerRequest)
  const headers = new Headers(result.headers)
  headers.delete('access-control-allow-origin')
  headers.delete('access-control-allow-credentials')
  return new Response(result.body, { status: result.status, statusText: result.statusText, headers })
})
`

const serveShim = `
export const serve = (handler: (request: Request) => Response | Promise<Response>) =>
  Deno.serve(handler)
`

const supabaseCompat = `
import * as real from 'supabase-real'
export * from 'supabase-real'

const readHeader = (headers: unknown, name: string): string => {
  if (headers instanceof Headers) return headers.get(name) || ''
  if (!headers || typeof headers !== 'object') return ''
  const record = headers as Record<string, unknown>
  const value = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()]
  return typeof value === 'string' ? value : ''
}

const decodePayload = (token: string): Record<string, unknown> | null => {
  try {
    const encoded = token.split('.')[1]
    if (!encoded) return null
    const normalized = encoded.replace(/-/gu, '+').replace(/_/gu, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

export const createClient = (...args: Parameters<typeof real.createClient>) => {
  const client = real.createClient(...args)
  const [baseUrl, apiKey, options] = args
  const configuredAuthorization = readHeader(options?.global?.headers, 'authorization')
  client.auth.getUser = async (explicitToken?: string) => {
    const token = explicitToken || configuredAuthorization.replace(/^Bearer\\s+/iu, '')
    const payload = token ? decodePayload(token) : null
    const subject = typeof payload?.sub === 'string' ? payload.sub : ''
    if (!token || !subject) return { data: { user: null }, error: new Error('Invalid access token') }
    const normalizedBaseUrl = String(baseUrl).endsWith('/')
      ? String(baseUrl).slice(0, -1)
      : String(baseUrl)
    const response = await fetch(\`\${normalizedBaseUrl}/rest/v1/sys_user?select=id&limit=0\`, {
      method: 'GET',
      headers: { apikey: String(apiKey), Authorization: \`Bearer \${token}\` }
    })
    if (!response.ok) return { data: { user: null }, error: new Error('Invalid access token') }
    return {
      data: {
        user: {
          id: subject,
          aud: typeof payload.aud === 'string' ? payload.aud : 'authenticated',
          role: typeof payload.role === 'string' ? payload.role : 'authenticated',
          email: typeof payload.email === 'string' ? payload.email : '',
          phone: typeof payload.phone === 'string' ? payload.phone : '',
          app_metadata: payload.app_metadata ?? {},
          user_metadata: payload.user_metadata ?? {},
          identities: [],
          created_at: typeof payload.iat === 'number' ? new Date(payload.iat * 1000).toISOString() : ''
        }
      },
      error: null
    }
  }
  return client
}
`

const importMap = {
  imports: {
    'https://deno.land/std@0.224.0/http/server.ts': './serve-shim.ts',
    'https://deno.land/std@0.201.0/http/server.ts': './serve-shim.ts',
    'supabase-compat': './supabase-compat.ts',
    'supabase-real': 'npm:@supabase/supabase-js@2.118.0'
  }
}

const dockerfile = `FROM denoland/deno:2.5.4
WORKDIR /app
COPY . .
RUN deno cache --import-map=import_map.json router.ts
EXPOSE 80
CMD ["run", "--allow-env", "--allow-net", "--allow-read=/app", "--import-map=import_map.json", "router.ts"]
`

await Promise.all([
  writeFile(path.join(outputRoot, 'router.ts'), router.trimStart(), 'utf8'),
  writeFile(path.join(outputRoot, 'serve-shim.ts'), serveShim.trimStart(), 'utf8'),
  writeFile(path.join(outputRoot, 'supabase-compat.ts'), supabaseCompat.trimStart(), 'utf8'),
  writeFile(
    path.join(outputRoot, 'import_map.json'),
    `${JSON.stringify(importMap, null, 2)}\n`,
    'utf8'
  ),
  writeFile(path.join(outputRoot, 'Dockerfile'), dockerfile, 'utf8'),
  writeFile(path.join(outputRoot, '.dockerignore'), '.git\nnode_modules\n', 'utf8')
])

process.stdout.write(`${JSON.stringify({ outputRoot, functions: functionNames.length })}\n`)
