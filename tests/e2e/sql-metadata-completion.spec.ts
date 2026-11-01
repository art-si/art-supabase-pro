import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120000)

interface MetadataRequest {
  action?: string
  mode?: string
  keyword?: string
  query?: string
  tables?: { schema: string; name: string }[]
}
interface AiRequest {
  metadata?: { tables?: { tableName: string; columns?: unknown[] }[] }
}
const names = ['orders', 'customers', ...Array.from({ length: 14 }, (_, i) => `reference_${i}`)]
const fieldNames = ['id', 'tenant_id', 'amount', 'order_number']
const summary = (name: string) => ({
  tableSchema: 'public',
  tableName: name,
  kind: 'table',
  description: name === 'orders' ? '订单收入' : name,
  detailsLoaded: false,
  columnCount: fieldNames.length,
  columns: [],
  indexes: []
})
const emptyMetadata = {
  schemas: ['public'],
  tables: [],
  columns: [],
  functions: [],
  foreignKeys: []
}

async function prepare(page: Page, project: string, ordinary = false, tenant = 'tenant-a') {
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: project.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !project.includes('shadow')
  })
  page.setDefaultNavigationTimeout(60000)
  page.setDefaultTimeout(15000)
  const calls: MetadataRequest[] = []
  const ai: AiRequest[] = []
  let executions = 0
  const state = { failDetails: false, holdDetails: false }
  let release: () => void = () => undefined
  await page.route('**/functions/v1/execute-sql-with-columns', async (route) => {
    const body = route.request().postDataJSON() as MetadataRequest
    if (body.action === 'metadata') {
      calls.push(body)
      if (body.mode === 'catalog')
        return route.fulfill({
          json: { ...emptyMetadata, metadataMode: 'catalog', tables: names.map(summary) }
        })
      if (body.mode === 'search')
        return route.fulfill({
          json: {
            ...emptyMetadata,
            metadataMode: 'search',
            tables: [{ ...summary('orders'), matchedColumns: ['amount'] }],
            searchTruncated: false
          }
        })
      if (body.mode === 'functions')
        return route.fulfill({
          json: { ...emptyMetadata, metadataMode: 'functions', functions: [] }
        })
      if (body.mode === 'tables') {
        if (state.failDetails)
          return route.fulfill({
            status: 503,
            json: { status: 'error', message: '字段详情暂不可用，请重试' }
          })
        if (state.holdDetails)
          await new Promise<void>((resolve) => {
            release = resolve
          })
        const tables = (body.tables || []).map(({ name }) => ({
          ...summary(name),
          detailsLoaded: true
        }))
        const columns = tables.flatMap((table) =>
          fieldNames.map((name, index) => ({
            tableSchema: 'public',
            tableName: table.tableName,
            columnName: name,
            dataType: name === 'id' ? 'integer' : name === 'amount' ? 'numeric' : 'text',
            isNullable: name === 'id' || name === 'tenant_id' ? 'NO' : 'YES',
            ordinalPosition: index + 1,
            isPrimaryKey: name === 'id',
            description: name === 'amount' ? '订单收入' : undefined
          }))
        )
        return route.fulfill({
          json: { ...emptyMetadata, metadataMode: 'tables', tables, columns }
        })
      }
      throw new Error(`unexpected legacy metadata request: ${JSON.stringify(body)}`)
    }
    executions++
    return route.fulfill({
      json: {
        status: 'ok',
        rows: [{ id: 1, tenant_id: 'tenant-a', amount: '25.00', order_number: 'ORDER-001' }],
        columns: fieldNames.map((name) => ({
          name,
          type: name === 'id' ? 'integer' : name === 'amount' ? 'numeric' : 'text'
        })),
        rowCount: 1,
        durationMs: 2,
        commandTag: 'SELECT'
      }
    })
  })
  await page.route('**/functions/v1/ai-sql-assistant', (route) => {
    ai.push(route.request().postDataJSON() as AiRequest)
    return route.fulfill({
      json: {
        sql: 'SELECT * FROM public.orders LIMIT 10;',
        summary: '已生成订单收入查询',
        warnings: [],
        model: 'fixture-model'
      }
    })
  })
  await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=metadata-completion-${ordinary ? 'ordinary' : 'super'}&tenant=${tenant}${ordinary ? '&ordinary=1' : ''}`
  )
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect.poll(() => calls.filter((call) => call.mode === 'catalog').length).toBe(1)
  const setSql = async (sql: string) => {
    await page
      .locator('.monaco-editor')
      .getByRole('textbox', { name: 'SQL 编辑器', exact: true })
      .focus()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.insertText(sql)
  }
  const complete = async () => {
    await page
      .locator('.monaco-editor')
      .getByRole('textbox', { name: 'SQL 编辑器', exact: true })
      .focus()
    await page.keyboard.press('ControlOrMeta+Space')
  }
  return {
    calls,
    ai,
    state,
    setSql,
    complete,
    release: () => {
      state.holdDetails = false
      release()
    },
    executions: () => executions
  }
}

test('alias completion hydrates columns without opening the tree and reuses cached details', async ({
  page
}, info) => {
  const fixture = await prepare(page, info.project.name)
  expect(fixture.calls.filter((call) => call.mode === 'tables')).toHaveLength(0)
  await fixture.setSql('SELECT * FROM public.orders o WHERE o.')
  await fixture.complete()
  const suggestions = page.locator('.suggest-widget.visible')
  await expect(suggestions.getByText('order_number', { exact: true })).toBeVisible()
  expect(fixture.calls.filter((call) => call.mode === 'tables')).toHaveLength(1)
  if ((page.viewportSize()?.width || 0) > 900) {
    const resources = page.getByRole('complementary', { name: '数据库资源', exact: true })
    await expect(
      resources.getByRole('button', { name: '定位对象 orders', exact: true })
    ).toHaveCount(0)
  }
  await page.keyboard.press('Escape')
  await fixture.complete()
  await expect(suggestions.getByText('order_number', { exact: true })).toBeVisible()
  expect(fixture.calls.filter((call) => call.mode === 'tables')).toHaveLength(1)
  expect(fixture.calls.filter((call) => call.mode === 'catalog')).toHaveLength(1)
  expect(fixture.executions()).toBe(0)
  await page.screenshot({ path: info.outputPath('completion-lazy-ready.png') })
})

test('detail failure leaves execution usable and inline retry preserves the directory', async ({
  page
}, info) => {
  const fixture = await prepare(page, info.project.name)
  fixture.state.failDetails = true
  await fixture.setSql('SELECT * FROM public.orders o WHERE o.')
  await fixture.complete()
  const warning = page.locator('.sql-editor-section__metadata-alert')
  await expect(warning).toContainText('重试')
  await page.keyboard.press('Escape')
  await fixture.setSql('SELECT id,tenant_id,amount,order_number FROM public.orders;')
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await expect(page.locator('.result-table-container')).toContainText('ORDER-001')
  expect(fixture.executions()).toBe(1)
  fixture.state.failDetails = false
  fixture.state.holdDetails = true
  const attempts = fixture.calls.filter((call) => call.mode === 'tables').length
  await warning.getByRole('button', { name: '重试加载', exact: true }).click()
  await expect
    .poll(() => fixture.calls.filter((call) => call.mode === 'tables').length)
    .toBeGreaterThan(attempts)
  expect(fixture.calls.filter((call) => call.mode === 'catalog')).toHaveLength(1)
  if ((page.viewportSize()?.width || 0) > 900)
    await expect(page.getByRole('button', { name: '定位对象 public', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toBeEnabled()
  fixture.release()
  await expect(warning).toHaveCount(0)
  await fixture.setSql('SELECT * FROM public.orders o WHERE o.')
  await fixture.complete()
  await expect(
    page.locator('.suggest-widget.visible').getByText('order_number', { exact: true })
  ).toBeVisible()
  expect(fixture.calls.filter((call) => call.mode === 'catalog')).toHaveLength(1)
  await page.screenshot({ path: info.outputPath('completion-error-recovered.png') })
})

test('ordinary-user AI searches the full catalog and receives at most twelve complete tables', async ({
  page
}, info) => {
  const fixture = await prepare(page, info.project.name, true)
  await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toBeDisabled()
  const originalDraft = await page.locator('.monaco-editor .view-lines').innerText()
  await page.getByRole('button', { name: 'AI 写 SQL', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'AI SQL 助手', exact: true })
  await dialog
    .getByPlaceholder('例如：查出最近 30 天注册且已启用的用户，按创建时间倒序')
    .fill('订单收入趋势')
  await dialog.getByRole('button', { name: '生成 SQL', exact: true }).click()
  await expect.poll(() => fixture.ai.length).toBe(1)
  const tables = fixture.ai[0].metadata?.tables
  expect(tables?.length).toBeGreaterThan(0)
  expect(tables?.length).toBeLessThanOrEqual(12)
  expect(tables?.every((table) => table.columns?.length === fieldNames.length)).toBe(true)
  expect(tables?.some((table) => table.tableName === 'orders')).toBe(true)
  expect(fixture.calls.some((call) => call.mode === 'search')).toBe(true)
  expect(fixture.calls.some((call) => call.mode === 'tables')).toBe(true)
  expect(fixture.executions()).toBe(0)
  const preview = dialog.getByRole('region', { name: 'AI SQL 生成结果', exact: true })
  await expect(preview).toBeVisible()
  expect(await preview.getByLabel('AI SQL 预览代码', { exact: true }).textContent()).toBe(
    'SELECT * FROM public.orders LIMIT 10;'
  )
  expect(await page.locator('.monaco-editor .view-lines').innerText()).toBe(originalDraft)
  await preview.getByRole('button', { name: '在新页签打开', exact: true }).click()
  await expect(
    page.getByRole('tablist', { name: 'SQL 查询页签', exact: true }).getByRole('tab')
  ).toHaveCount(2)
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('public.orders')
  await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toBeDisabled()
  expect(fixture.executions()).toBe(0)
})

test('result-copy editing hydrates primary-key metadata and keeps identity fields locked', async ({
  page
}, info) => {
  const fixture = await prepare(page, info.project.name)
  await fixture.setSql('SELECT * FROM public.orders;')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  const result = page.locator('.result-table-container')
  await expect(result).toContainText('ORDER-001')
  expect(fixture.calls.filter((call) => call.mode === 'tables')).toHaveLength(0)
  await result.getByRole('button', { name: '编辑副本', exact: true }).click()
  await expect(result.getByRole('button', { name: '退出编辑', exact: true })).toBeVisible()
  expect(fixture.calls.filter((call) => call.mode === 'tables')).toHaveLength(1)
  await expect(result.getByRole('button', { name: '编辑第 1 行 id', exact: true })).toHaveCount(0)
  await expect(
    result.getByRole('button', { name: '编辑第 1 行 tenant_id', exact: true })
  ).toHaveCount(0)
  await expect(
    result.getByRole('button', { name: '编辑第 1 行 amount', exact: true })
  ).toBeVisible()
  expect(fixture.executions()).toBe(1)
  await page.screenshot({ path: info.outputPath('lazy-metadata-edit-locks.png') })
})

test('late details from a previous tenant never replace the current completion cache', async ({
  page
}, info) => {
  const tenantA = '00000000-0000-4000-8000-000000000001'
  const tenantB = '00000000-0000-4000-8000-000000000002'
  // The standalone fixture has no shell; mirror its persisted transport scope before mounting.
  await page.addInitScript((tenant) => {
    sessionStorage.setItem('art-platform-tenant-scope-active', '1')
    sessionStorage.setItem('art-platform-tenant-scope-id', tenant)
  }, tenantA)
  const requests: { mode?: string; tenant?: string }[] = []
  page.on('request', (request) => {
    if (!request.url().endsWith('/functions/v1/execute-sql-with-columns')) return
    const body = request.postDataJSON() as MetadataRequest
    if (body.action === 'metadata')
      requests.push({ mode: body.mode, tenant: request.headers()['x-art-tenant-scope'] })
  })
  const fixture = await prepare(page, info.project.name, false, tenantA)
  expect(requests.filter((request) => request.mode === 'catalog')).toEqual([
    { mode: 'catalog', tenant: tenantA }
  ])
  let releaseOldDetails: (() => void) | undefined
  let oldDetailsDelivered = false
  await page.route('**/functions/v1/execute-sql-with-columns', async (route) => {
    const body = route.request().postDataJSON() as MetadataRequest
    const tenant = route.request().headers()['x-art-tenant-scope']
    if (body.action !== 'metadata') return route.fallback()
    if (body.mode === 'catalog')
      return route.fulfill({
        json: { ...emptyMetadata, metadataMode: 'catalog', tables: names.map(summary) }
      })
    if (body.mode !== 'tables') return route.fallback()
    expect([tenantA, tenantB]).toContain(tenant)
    if (tenant === tenantA)
      await new Promise<void>((resolve) => {
        releaseOldDetails = resolve
      })
    const columnName = tenant === tenantA ? 'secret_field' : 'safe_field'
    await route.fulfill({
      json: {
        ...emptyMetadata,
        metadataMode: 'tables',
        tables: [{ ...summary('orders'), detailsLoaded: true, columnCount: 1 }],
        columns: [
          {
            tableSchema: 'public',
            tableName: 'orders',
            columnName,
            dataType: 'text',
            isNullable: 'YES',
            ordinalPosition: 1
          }
        ]
      }
    })
    if (tenant === tenantA) oldDetailsDelivered = true
  })
  await fixture.setSql('SELECT * FROM public.orders o WHERE o.')
  await fixture.complete()
  await expect.poll(() => Boolean(releaseOldDetails)).toBe(true)
  expect(requests.filter((request) => request.mode === 'tables')).toEqual([
    { mode: 'tables', tenant: tenantA }
  ])

  await page.evaluate(async (tenant) => {
    const path = '/src/utils/tenant-scope-context.ts'
    const scope = (await import(path)) as typeof import('../../src/utils/tenant-scope-context')
    scope.writeTenantScopeId(tenant)
    window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenant }))
  }, tenantB)
  await expect
    .poll(() =>
      requests.filter((request) => request.mode === 'catalog').map((request) => request.tenant)
    )
    .toEqual([tenantA, tenantB])
  await fixture.setSql('SELECT * FROM public.orders o WHERE o.')
  await fixture.complete()
  const suggestions = page.locator('.suggest-widget.visible')
  await expect(suggestions.getByText('safe_field', { exact: true })).toBeVisible()
  await expect(suggestions.getByText('secret_field', { exact: true })).toHaveCount(0)
  expect(requests.filter((request) => request.mode === 'tables')).toEqual([
    { mode: 'tables', tenant: tenantA },
    { mode: 'tables', tenant: tenantB }
  ])

  const oldResponse = page.waitForResponse((response) => {
    const request = response.request()
    return (
      request.url().endsWith('/functions/v1/execute-sql-with-columns') &&
      request.headers()['x-art-tenant-scope'] === tenantA &&
      (request.postDataJSON() as MetadataRequest).mode === 'tables'
    )
  })
  if (!releaseOldDetails) throw new Error('Tenant A detail request did not start')
  releaseOldDetails()
  await oldResponse
  await expect.poll(() => oldDetailsDelivered).toBe(true)
  await page.keyboard.press('Escape')
  await fixture.complete()
  await expect(suggestions.getByText('safe_field', { exact: true })).toBeVisible()
  await expect(suggestions.getByText('secret_field', { exact: true })).toHaveCount(0)
  await expect(page.locator('.sql-editor-section__metadata-alert')).toHaveCount(0)
  expect(
    requests.filter((request) => request.mode === 'tables' && request.tenant === tenantB)
  ).toHaveLength(1)
  await page.screenshot({ path: info.outputPath('completion-tenant-late-details.png') })
})
