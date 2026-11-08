import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { collectAppRuntimeErrors } from './support/runtime-errors'
import type { TenantReferenceController } from './fixtures/tenant-reference-query'

type ReferenceWindow = Window & { __tenantReferenceQuery: TenantReferenceController }
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const tenantC = '33333333-3333-4333-8333-333333333333'
const projects = [tenantA, tenantB, tenantC].map((tenantId, index) => ({
  id: `project-${index}`,
  tenant_id: tenantId
}))
const units = projects.map((row) => ({
  ...row,
  id: `unit-${row.id}`,
  unit_code: 'PCS',
  unit_name: '件',
  symbol: '件'
}))
test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

async function mount(page: Page, ordinary = false) {
  const errors = collectAppRuntimeErrors(page)
  const blocked: string[] = []
  const requests: Array<{ table: string; filter: string | null; header: string | null }> = []
  const served = new Set<string>()
  await page.context().route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(test.info().project.use.baseURL as string).origin)
      return route.continue()
    blocked.push(`${route.request().method()} ${url.pathname}`)
    return route.abort()
  })
  await prepareIsolatedSession(page)
  await page.route(/\/(?:rest\/v1|v1\/rdb\/rest)\//, (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const table = url.pathname.split('/').at(-1) ?? ''
    const cors = {
      'access-control-allow-origin':
        request.headers().origin || new URL(test.info().project.use.baseURL as string).origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': request.headers()['access-control-request-headers'] || '*'
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (!['mdm_project', 'mdm_unit_of_measure'].includes(table)) {
      blocked.push(`${request.method()} ${table}`)
      return route.fulfill({
        status: 400,
        headers: cors,
        json: { message: 'unexpected fixture request' }
      })
    }
    const headers = request.headers()
    const header = headers['x-art-tenant-scope'] ?? headers['x-metadata'] ?? null
    const scope = ordinary ? tenantA : header || null
    const filter = url.searchParams.get('tenant_id')
    const targets = filter?.startsWith('eq.')
      ? [filter.slice(3)]
      : filter?.startsWith('in.(')
        ? filter.slice(4, -1).split(',')
        : null
    requests.push({ table, filter, header })
    const available = table === 'mdm_unit_of_measure' ? units : projects
    const data = available.filter(
      (row) => (!scope || row.tenant_id === scope) && (!targets || targets.includes(row.tenant_id))
    )
    return route.fulfill({
      headers: {
        ...cors,
        'content-range': `0-${Math.max(0, data.length - 1)}/${data.length}`,
        'access-control-expose-headers': 'content-range'
      },
      json: data
    })
  })
  page.on('response', (response) => {
    const url = new URL(response.url())
    if (
      response.status() === 200 &&
      [
        '/src/plugins/supabase.ts',
        '/src/api/providers/supabase/query.ts',
        '/src/api/unit-of-measure.ts'
      ].includes(url.pathname)
    )
      served.add(url.pathname)
  })
  await page.goto('/tests/e2e/fixtures/tenant-reference-query.html')
  await page.waitForFunction(() => typeof window.__tenantReferenceQuery?.projects === 'function')
  return { errors, blocked, requests, served }
}

test('实际编译请求保留显式 B、租户子集与旧全部租户读取', async ({ page }) => {
  const result = await mount(page)
  await page.evaluate(() => window.__tenantReferenceQuery.setScope(true, null))
  const single = await page.evaluate(
    (target) => window.__tenantReferenceQuery.projects([target], target),
    tenantB
  )
  expect(single).toEqual([{ id: 'project-1', tenantId: tenantB }])
  const subset = await page.evaluate(
    ([a, b]) => window.__tenantReferenceQuery.units([a, b]),
    [tenantA, tenantB]
  )
  expect(subset.map((row) => row.tenantId)).toEqual([tenantA, tenantB])
  const legacy = await page.evaluate(
    (target) => window.__tenantReferenceQuery.projects([target]),
    tenantA
  )
  expect(legacy.map((row) => row.tenantId)).toEqual([tenantA, tenantB, tenantC])
  expect(result.requests).toEqual([
    { table: 'mdm_project', filter: `eq.${tenantB}`, header: tenantB },
    { table: 'mdm_unit_of_measure', filter: `in.(${tenantA},${tenantB})`, header: '' },
    { table: 'mdm_project', filter: null, header: null }
  ])
  expect(await page.evaluate(() => window.__tenantReferenceQuery.selected())).toBeNull()
  expect([...result.served].sort()).toEqual([
    '/src/api/providers/supabase/query.ts',
    '/src/api/unit-of-measure.ts',
    '/src/plugins/supabase.ts'
  ])
  expect(result.blocked).toEqual([])
  expect(result.errors).toEqual([])
})

test('实际选定 A 时显式 B 不会被解析为 A 的引用', async ({ page }) => {
  const result = await mount(page)
  await page.evaluate((target) => window.__tenantReferenceQuery.setScope(true, target), tenantA)
  const rows = await page.evaluate(
    (target) => window.__tenantReferenceQuery.projects([target], target),
    tenantB
  )
  expect(rows).toEqual([])
  expect(result.requests).toEqual([
    { table: 'mdm_project', filter: `eq.${tenantB}`, header: tenantA }
  ])
  expect(result.blocked).toEqual([])
  expect(result.errors).toEqual([])
})

test('普通用户伪造 B 请求头时模型服务仍按认证租户 A 返回', async ({ page }) => {
  const result = await mount(page, true)
  await page.evaluate(
    (target) => (window as ReferenceWindow).__tenantReferenceQuery.setScope(false, target),
    tenantB
  )
  const cross = await page.evaluate(
    (target) => window.__tenantReferenceQuery.projects([target], target),
    tenantB
  )
  expect(cross).toEqual([])
  const own = await page.evaluate(
    (target) => window.__tenantReferenceQuery.projects([target], target),
    tenantA
  )
  expect(own).toEqual([{ id: 'project-0', tenantId: tenantA }])
  expect(result.blocked).toEqual([])
  expect(result.errors).toEqual([])
})
