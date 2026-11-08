import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import ts from 'typescript'
import { uniq } from 'lodash-es'
import { withRequestOptions, type SupabaseQueryLike } from '../../src/api/providers/supabase/query'
import { fetchAllRangePages } from '../../src/utils/supabase/pagination'
import { keysToCamelDeep } from '../../src/utils/supabase/key-transform'
import type { UnitDisplayOption } from '../../src/utils/business/unit-display'
import * as tenant from '../../src/utils/tenant-scope-context'

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const tenantC = '33333333-3333-4333-8333-333333333333'
interface FixtureDatabase {
  public: {
    Tables: {
      mdm_project: {
        Row: { id: string; tenant_id: string }
        Insert: { id: string; tenant_id: string }
        Update: { id?: string; tenant_id?: string }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
const records = [
  { id: 'project-a', tenant_id: tenantA },
  { id: 'project-b', tenant_id: tenantB },
  { id: 'project-c', tenant_id: tenantC }
]
const units = records.map((row) => ({
  id: `unit-${row.id}`,
  tenant_id: row.tenant_id,
  unit_code: 'PCS',
  unit_name: '件',
  symbol: '件'
}))
const source = readFileSync(new URL('../../src/plugins/supabase.ts', import.meta.url), 'utf8')
const ast = ts.createSourceFile('supabase.ts', source, ts.ScriptTarget.Latest, true)
const fetchDeclaration = ast.statements
  .filter(ts.isVariableStatement)
  .flatMap((statement) => [...statement.declarationList.declarations])
  .find((declaration) => declaration.name.getText(ast) === 'tenantScopeFetch')
assert.ok(fetchDeclaration?.initializer)
const nativeFetchInitializer = fetchDeclaration.initializer
let sdkFetch: ts.ArrowFunction | undefined
function findSdkFetch(node: ts.Node): void {
  if (
    ts.isBinaryExpression(node) &&
    node.left.getText(ast) === 'requestApp.request.fetch' &&
    ts.isArrowFunction(node.right)
  )
    sdkFetch = node.right
  ts.forEachChild(node, findSdkFetch)
}
findSdkFetch(ast)
assert.ok(sdkFetch)
const sdkFetchInitializer = sdkFetch

type Transport = 'supabase' | 'cloudbase-postgrest' | 'cloudbase-sdk'
interface SdkRequest {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: BodyInit | null
}
interface CapturedRequest {
  url: URL
  headers: Headers
  signal: AbortSignal | null | undefined
}

async function withTransport(
  transport: Transport,
  mode: 'all' | 'selected' | 'ordinary' | 'forged',
  run: (fixture: {
    client: SupabaseClient<FixtureDatabase>
    requests: CapturedRequest[]
    header: string
    send: typeof fetch
  }) => Promise<void>
): Promise<void> {
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const buildDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__CLOUDBASE_BUILD__')
  const storage = new Map<string, string>()
  const platform = mode === 'all' || mode === 'selected'
  if (platform) storage.set(tenant.TENANT_SCOPE_MODE_STORAGE_KEY, '1')
  if (mode === 'selected') storage.set(tenant.TENANT_SCOPE_STORAGE_KEY, tenantA)
  if (mode === 'forged') storage.set(tenant.TENANT_SCOPE_STORAGE_KEY, tenantB)
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    }
  })
  Object.defineProperty(globalThis, '__CLOUDBASE_BUILD__', {
    configurable: true,
    value: transport !== 'supabase'
  })
  const header =
    transport === 'supabase' ? tenant.TENANT_SCOPE_HEADER : tenant.CLOUDBASE_TENANT_SCOPE_HEADER
  const requests: CapturedRequest[] = []
  // The response models canonical scope enforcement; it does not test production JWT/RLS.
  const observedFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
    requests.push({ url, headers, signal: init?.signal })
    const scope = platform ? headers.get(header) : tenantA
    const filter = url.searchParams.get('tenant_id')
    const targets = filter?.startsWith('eq.')
      ? [filter.slice(3)]
      : filter?.startsWith('in.(')
        ? filter.slice(4, -1).split(',')
        : null
    const available = url.pathname.endsWith('/mdm_unit_of_measure') ? units : records
    const data = available.filter(
      (row) => (!scope || row.tenant_id === scope) && (!targets || targets.includes(row.tenant_id))
    )
    return new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json' }
    })
  }
  const dependencies = {
    readTenantScopeId: tenant.readTenantScopeId,
    shouldAttachStorageTenantScopeHeader: tenant.shouldAttachStorageTenantScopeHeader,
    supabaseUrl: 'https://fixture.invalid',
    shouldAttachTenantScopeHeader: tenant.shouldAttachTenantScopeHeader,
    readPlatformTenantScopeActive: tenant.readPlatformTenantScopeActive,
    readMutationTenantScopeId: tenant.readMutationTenantScopeId,
    normalizePlatformTenantReadUrl: tenant.normalizePlatformTenantReadUrl,
    tenantScopeHeader: header,
    fetch: observedFetch,
    cloudBaseFetch: (options: SdkRequest) =>
      observedFetch(options.url, {
        method: options.method,
        headers: options.headers,
        body: options.body
      })
  }
  const initializer = transport === 'cloudbase-sdk' ? sdkFetchInitializer : nativeFetchInitializer
  // This adapter loads the actual fetch closure without starting browser Auth/SDK bootstrap.
  const loaded: unknown = new Function(
    ...Object.keys(dependencies),
    'return ' + initializer.getText(ast)
  )(...Object.values(dependencies))
  assert.equal(typeof loaded, 'function')
  const fetcher: typeof fetch =
    transport === 'cloudbase-sdk'
      ? (input, init) => {
          const url = new URL(input instanceof Request ? input.url : String(input))
          url.pathname = url.pathname.replace('/rest/v1', '/v1/rdb/rest')
          return (loaded as (options: SdkRequest) => Promise<Response>)({
            url: url.href,
            method: init?.method,
            headers: Object.fromEntries(new Headers(init?.headers)),
            body: init?.body
          })
        }
      : (loaded as typeof fetch)
  const client = createClient<FixtureDatabase>(
    'https://fixture.invalid',
    'synthetic-anon-key-no-network',
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: fetcher }
    }
  )
  try {
    await run({ client, requests, header, send: fetcher })
  } finally {
    if (storageDescriptor) Object.defineProperty(globalThis, 'sessionStorage', storageDescriptor)
    else Reflect.deleteProperty(globalThis, 'sessionStorage')
    if (buildDescriptor) Object.defineProperty(globalThis, '__CLOUDBASE_BUILD__', buildDescriptor)
    else Reflect.deleteProperty(globalThis, '__CLOUDBASE_BUILD__')
  }
}

function unitReader(
  client: SupabaseClient<FixtureDatabase>,
  afterBatch?: () => void
): (ids: string[]) => Promise<UnitDisplayOption[]> {
  const unitSource = readFileSync(
    new URL('../../src/api/unit-of-measure.ts', import.meta.url),
    'utf8'
  )
  const unitAst = ts.createSourceFile(
    'unit-of-measure.ts',
    unitSource,
    ts.ScriptTarget.Latest,
    true
  )
  const declaration = unitAst.statements.find(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === 'fetchUnitDisplayOptions'
  )
  assert.ok(declaration)
  const body = ts.transpileModule(declaration.getText(unitAst).replace(/^export\s+/, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  }).outputText
  const responseHandle = async (query: () => PromiseLike<{ data: unknown; error: unknown }>) => {
    const result = await query()
    if (result.error) throw result.error
    return { ...result, data: keysToCamelDeep(result.data) }
  }
  const collect: typeof fetchAllRangePages = afterBatch
    ? async (fetchPage, options) => {
        const result = await fetchAllRangePages(fetchPage, options)
        afterBatch()
        return result
      }
    : fetchAllRangePages
  // Only the API bootstrap is substituted; its actual function, client and shared helpers run.
  const loaded: unknown = new Function(
    'uniq',
    'fetchAllRangePages',
    'responseHandle',
    'supabase',
    'withRequestOptions',
    'assertTenantReadTargetId',
    'createTenantScopeReadGuard',
    body + '\nreturn fetchUnitDisplayOptions'
  )(
    uniq,
    collect,
    responseHandle,
    client,
    withRequestOptions,
    tenant.assertTenantReadTargetId,
    tenant.createTenantScopeReadGuard
  )
  assert.equal(typeof loaded, 'function')
  return loaded as (ids: string[]) => Promise<UnitDisplayOption[]>
}

for (const transport of ['supabase', 'cloudbase-postgrest', 'cloudbase-sdk'] as const) {
  test(`${transport}: explicit target B stays narrow in platform-all`, async () => {
    await withTransport(transport, 'all', async ({ client, requests, header }) => {
      const controller = new AbortController()
      const query = client.from('mdm_project').select('id,tenant_id').eq('tenant_id', tenantB)
      const options = { readTenantId: tenantB, signal: controller.signal }
      const result = await withRequestOptions(query, options)
      assert.equal(result.error, null)
      assert.deepEqual(result.data, [records[1]])
      assert.equal(requests[0].url.searchParams.get('tenant_id'), `eq.${tenantB}`)
      assert.equal(requests[0].headers.get(header), tenantB)
      if (transport !== 'cloudbase-sdk') assert.equal(requests[0].signal, controller.signal)
    })
  })

  test(`${transport}: selected A cannot resolve an explicit B reference as A`, async () => {
    await withTransport(transport, 'selected', async ({ client, requests, header }) => {
      const query = client.from('mdm_project').select('id,tenant_id').eq('tenant_id', tenantB)
      const result = await withRequestOptions(query, { signal: undefined, readTenantId: tenantB })
      assert.deepEqual(result.data, [])
      assert.equal(requests[0].url.searchParams.get('tenant_id'), `eq.${tenantB}`)
      assert.equal(requests[0].headers.get(header), tenantA)
    })
  })

  test(`${transport}: legacy all-tenant reads retain their existing behavior`, async () => {
    await withTransport(transport, 'all', async ({ client, requests, header }) => {
      const result = await withRequestOptions(
        client.from('mdm_project').select('id,tenant_id').eq('tenant_id', tenantA)
      )
      assert.deepEqual(result.data, records)
      assert.equal(requests[0].url.searchParams.has('tenant_id'), false)
      assert.equal(requests[0].headers.has(header), false)
    })
  })

  for (const mode of ['ordinary', 'forged'] as const) {
    test(`${transport}: ${mode} reference reads retain the authenticated tenant boundary`, async () => {
      await withTransport(transport, mode, async ({ client }) => {
        const target = mode === 'ordinary' ? tenantA : tenantB
        const result = await withRequestOptions(
          client.from('mdm_project').select('id,tenant_id').eq('tenant_id', target),
          { signal: undefined, readTenantId: target }
        )
        assert.deepEqual(result.data, mode === 'ordinary' ? [records[0]] : [])
      })
    })
  }

  test(`${transport}: concurrent reference targets do not change client or workspace scope`, async () => {
    await withTransport(transport, 'all', async ({ client }) => {
      const results = await Promise.all(
        [tenantA, tenantB].map((target) =>
          withRequestOptions(
            client.from('mdm_project').select('id,tenant_id').eq('tenant_id', target),
            { signal: undefined, readTenantId: target }
          )
        )
      )
      assert.deepEqual(
        results.map((result) => result.data),
        [[records[0]], [records[1]]]
      )
      assert.equal(tenant.readTenantScopeId(), null)
      const subsequent = await client.from('mdm_project').select('id,tenant_id')
      assert.deepEqual(subsequent.data, records)
    })
  })

  test(`${transport}: explicit multi-tenant unit filters exclude unrelated tenants`, async () => {
    await withTransport(transport, 'all', async ({ client, requests }) => {
      const result = await withRequestOptions(
        client.from('mdm_project').select('id,tenant_id').in('tenant_id', [tenantA, tenantB]),
        { signal: undefined, readTenantId: null }
      )
      assert.deepEqual(result.data, records.slice(0, 2))
      assert.equal(requests[0].url.searchParams.get('tenant_id'), `in.(${tenantA},${tenantB})`)
      assert.equal(tenant.readTenantScopeId(), null)
    })
  })

  test(`${transport}: an explicit subset retains selected-tenant precedence`, async () => {
    await withTransport(transport, 'selected', async ({ client, requests, header }) => {
      const result = await withRequestOptions(
        client.from('mdm_project').select('id,tenant_id').in('tenant_id', [tenantA, tenantB]),
        { signal: undefined, readTenantId: null }
      )
      assert.deepEqual(result.data, [records[0]])
      assert.equal(requests[0].url.searchParams.get('tenant_id'), `in.(${tenantA},${tenantB})`)
      assert.equal(requests[0].headers.get(header), tenantA)
    })
  })

  test(`${transport}: explicit read headers do not replace mutation payload ownership`, async () => {
    await withTransport(transport, 'all', async ({ send, requests, header }) => {
      await send('https://fixture.invalid/rest/v1/mdm_project', {
        method: 'POST',
        headers: { [header]: tenantB, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'new-project', tenant_id: tenantA })
      })
      assert.equal(requests[0].headers.get(header), tenantA)
    })
  })

  test(`${transport}: HEAD reference reads keep their explicit filter and headers`, async () => {
    await withTransport(transport, 'all', async ({ client, requests, header }) => {
      const result = await withRequestOptions(
        client
          .from('mdm_project')
          .select('id', { head: true })
          .eq('tenant_id', tenantB)
          .setHeader('X-Fixture-Marker', 'preserved'),
        { signal: undefined, readTenantId: tenantB }
      )
      assert.equal(result.error, null)
      assert.equal(requests[0].url.searchParams.get('tenant_id'), `eq.${tenantB}`)
      assert.equal(requests[0].headers.get(header), tenantB)
      assert.equal(requests[0].headers.get('x-fixture-marker'), 'preserved')
    })
  })

  if (transport !== 'cloudbase-sdk') {
    test(`${transport}: Request headers merge without mutating the caller`, async () => {
      await withTransport(transport, 'selected', async ({ send, requests, header }) => {
        const request = new Request(
          `https://fixture.invalid/rest/v1/mdm_project?tenant_id=eq.${tenantB}`,
          { headers: { [header.toUpperCase()]: tenantB, 'X-Original': 'retained' } }
        )
        await send(request, { headers: { 'X-Additional': 'retained' } })
        assert.equal(request.headers.get(header), tenantB)
        assert.equal(requests[0].headers.get(header), tenantA)
        assert.equal(requests[0].headers.get('x-original'), 'retained')
        assert.equal(requests[0].headers.get('x-additional'), 'retained')
        assert.equal(requests[0].url.searchParams.get('tenant_id'), `eq.${tenantB}`)
      })
    })
  }

  test(`${transport}: the actual unit-name API reads only its explicit tenant targets`, async () => {
    await withTransport(transport, 'all', async ({ client, requests }) => {
      const load = unitReader(client)
      const single = await load([tenantB])
      assert.deepEqual(single, [keysToCamelDeep(units[1])])
      const subset = await load([tenantA, tenantB, tenantA])
      assert.deepEqual(
        subset,
        units.slice(0, 2).map((row) => keysToCamelDeep(row))
      )
      assert.equal(requests.length, 2)
      assert.equal(requests[1].url.searchParams.get('tenant_id'), `in.(${tenantA},${tenantB})`)
    })
  })

  test(`${transport}: unit-name reads retain100-tenant batches without a request per tenant`, async () => {
    await withTransport(transport, 'all', async ({ client, requests }) => {
      const tenants = Array.from(
        { length: 101 },
        (_, index) => `${(index + 1).toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`
      )
      await unitReader(client)(tenants)
      assert.equal(requests.length, 2)
      assert.equal(
        requests[0].url.searchParams.get('tenant_id'),
        `in.(${tenants.slice(0, 100).join(',')})`
      )
      assert.equal(requests[1].url.searchParams.get('tenant_id'), `in.(${tenants[100]})`)
    })
  })

  test(`${transport}: a scope change between unit batches retires the whole read`, async () => {
    await withTransport(transport, 'all', async ({ client, requests }) => {
      const tenants = Array.from(
        { length: 101 },
        (_, index) => `${(index + 1).toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`
      )
      const load = unitReader(client, () => tenant.writeTenantScopeId(tenantA))
      await assert.rejects(load(tenants), /租户范围已变化/)
      assert.equal(requests.length, 1)
    })
  })
}

test('invalid explicit reference targets fail before a network request', async () => {
  await withTransport('supabase', 'all', async ({ client, requests }) => {
    assert.throws(
      () =>
        withRequestOptions(client.from('mdm_project').select('id'), {
          signal: undefined,
          readTenantId: 'invalid-tenant'
        }),
      /目标租户无效/
    )
    assert.deepEqual(requests, [])
  })
})

test('unit-name reads validate the complete tenant input before their first batch', async () => {
  await withTransport('supabase', 'all', async ({ client, requests }) => {
    const valid = Array.from(
      { length: 100 },
      (_, index) => `${(index + 1).toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`
    )
    await assert.rejects(unitReader(client)([...valid, 'invalid-tenant']), /目标租户无效/)
    assert.deepEqual(requests, [])
  })
})

test('the shared filter query retains thenable and cancellation types with request options', async () => {
  await withTransport('supabase', 'all', async ({ client, requests }) => {
    const query: SupabaseQueryLike = client.from('mdm_project').select('*').eq('tenant_id', tenantB)
    const signal = new AbortController().signal
    const scoped: SupabaseQueryLike = withRequestOptions(query, { readTenantId: tenantB, signal })
    const result = await scoped
    assert.deepEqual(result.data, [records[1]])
    assert.equal(requests[0].url.searchParams.get('tenant_id'), `eq.${tenantB}`)
    assert.equal(requests[0].signal, signal)
  })
})
