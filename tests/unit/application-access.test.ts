import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import type { AccessibleApplication } from '../../src/api/system-manage/application-access'
import type { QueryResult } from '../../src/types/api/response'

const { outputText } = ts.transpileModule(
  readFileSync(
    new URL('../../src/api/system-manage/application-access.ts', import.meta.url),
    'utf8'
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
)

type ApplicationResult = QueryResult<AccessibleApplication[]>

test('a request from a previous login cannot clear the current application request', async () => {
  const previous = Promise.withResolvers<ApplicationResult>()
  const current = Promise.withResolvers<ApplicationResult>()
  const applications: AccessibleApplication[] = [
    { code: 'wms', name: '仓储', description: null, baseUrl: '/wms/', sort: 1 }
  ]
  const empty: ApplicationResult = { data: [], error: null }
  const pendingResults = [previous.promise, current.promise]
  let rpcCalls = 0
  const exports: Partial<typeof import('../../src/api/system-manage/application-access')> = {}

  runInNewContext(outputText, {
    exports,
    require: (path: string) => {
      assert.equal(path, '@/hooks/core/useSupabase')
      return {
        useSupabase: () => ({
          supabase: {
            rpc: (name: string) => {
              assert.equal(name, 'get_accessible_applications')
              return pendingResults[rpcCalls++] ?? Promise.resolve(empty)
            }
          },
          responseHandle: (query: () => Promise<ApplicationResult>) => query()
        })
      }
    }
  })

  const { fetchAccessibleApplications, clearAccessibleApplicationsCache } = exports
  assert.ok(fetchAccessibleApplications && clearAccessibleApplicationsCache)

  const previousRequest = fetchAccessibleApplications()
  clearAccessibleApplicationsCache()
  const currentRequest = fetchAccessibleApplications()
  previous.resolve(empty)
  await previousRequest

  const secondCaller = fetchAccessibleApplications()
  current.resolve({ data: applications, error: null })
  assert.deepEqual((await currentRequest).data, applications)
  assert.deepEqual((await secondCaller).data, applications)
  assert.deepEqual((await fetchAccessibleApplications()).data, applications)
  assert.equal(rpcCalls, 2)
})
