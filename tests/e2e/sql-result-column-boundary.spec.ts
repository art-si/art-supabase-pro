import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const ownTenant = '00000000-0000-4000-8000-000000000001'
const forgedTenant = '00000000-0000-4000-8000-000000000002'
const actor = '00000000-0000-4000-8000-000000000003'

async function prepare(page: Page, project: string) {
  page.setDefaultNavigationTimeout(60_000)
  page.setDefaultTimeout(15_000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: project.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !project.includes('shadow')
  })
  const columnConfigRequests: string[] = []
  page.on('request', (request) => {
    // Observe API traffic by category, without coupling this assertion to a guessed RPC path.
    if (['fetch', 'xhr'].includes(request.resourceType()) && /table[-_]column/i.test(request.url()))
      columnConfigRequests.push(request.url())
  })
  return columnConfigRequests
}

async function headerNames(grid: Locator) {
  return grid
    .locator('.el-table-v2__main .el-table-v2__header-cell .sql-result-column-header')
    .evaluateAll((headers) =>
      headers.map((header) => header.firstElementChild?.textContent?.trim())
    )
}

async function openColumns(page: Page, grid: Locator) {
  await grid.getByRole('button', { name: '设置显示列', exact: true }).click()
  const popover = page.locator('.el-popover:visible').filter({
    has: page.getByRole('group', { name: '列显示预设', exact: true })
  })
  await expect(popover).toBeVisible()
  return popover
}

test('ordinary result columns preserve tenant display policy through all-hidden recovery and forged UI scope', async ({
  page
}, info) => {
  const columnConfigRequests = await prepare(page, info.project.name)
  const resultMode = { tenantOnly: false }
  const reads: Array<{ action: string; scope?: string }> = []
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    const body = route.request().postDataJSON() as { action?: string }
    reads.push({
      action: body.action || 'execute',
      scope: route.request().headers()['x-art-tenant-scope']
    })
    return route.fulfill({
      json: { schemas: [], tables: [], columns: [], functions: [], foreignKeys: [] }
    })
  })
  await page.route('**/functions/v1/sql-query-api**', (route) => {
    const body = route.request().postDataJSON() as { action?: string }
    reads.push({
      action: body.action || 'invoke',
      scope: route.request().headers()['x-art-tenant-scope']
    })
    if (body.action === 'list')
      return route.fulfill({
        json: {
          canManage: false,
          users: [],
          definitions: [
            {
              id: '00000000-0000-4000-8000-000000000004',
              tenantId: ownTenant,
              slug: 'own-column-preview',
              name: '本租户字段查询',
              description: '隔离测试的已授权只读查询',
              sql: '',
              parameters: [],
              allowedUserIds: [actor],
              maxRows: 200,
              timeoutMs: 10000,
              enabled: true,
              updatedAt: '2026-10-31T00:00:00Z'
            }
          ]
        }
      })
    return route.fulfill({
      json: {
        status: 'ok',
        rows: resultMode.tenantOnly
          ? [{ tenant_id: ownTenant }]
          : [{ tenant_id: ownTenant, A: 'own-A', B: 'own-B' }],
        columns: resultMode.tenantOnly
          ? [{ name: 'tenant_id', type: 'text' }]
          : [
              { name: 'tenant_id', type: 'text' },
              { name: 'A', type: 'text' },
              { name: 'B', type: 'text' }
            ],
        rowCount: 1,
        durationMs: 2,
        truncated: false,
        maxRows: 200,
        timeoutMs: 10000
      }
    })
  })
  await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=${actor}&tenant=${ownTenant}&ordinary=1`
  )
  // Ordinary actors obtain a result through their granted API, without bypassing the SQL execution gate.
  await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '查询 API', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '查询 API', exact: true })
  await manager.getByRole('button', { name: '调用 API', exact: true }).click()
  const grid = manager.locator('.result-table-container')
  await expect(grid).toContainText('本次已加载 1 行 · 显示 2/2 列')
  await expect.poll(() => headerNames(grid)).toEqual(['A', 'B'])
  let popover = await openColumns(page, grid)
  await expect(popover.getByRole('checkbox')).toHaveCount(2)
  await expect(popover.getByRole('checkbox', { name: 'tenant_id', exact: true })).toHaveCount(0)
  await popover.getByText('A', { exact: true }).click()
  await popover.getByText('B', { exact: true }).click()
  await expect(grid).toContainText('本次已加载 1 行 · 显示 0/2 列')
  await expect(grid).toContainText('所有结果列已隐藏')
  await popover.getByRole('button', { name: '完整视图', exact: true }).click()
  await expect.poll(() => headerNames(grid)).toEqual(['A', 'B'])
  await expect(popover.getByRole('checkbox')).toHaveCount(2)
  await popover.press('Escape')
  await expect(popover).toBeHidden()
  popover = await openColumns(page, grid)
  await popover.getByText('A', { exact: true }).click()
  await popover.getByText('B', { exact: true }).click()
  await popover.press('Escape')
  await expect(popover).toBeHidden()
  await expect(grid.getByRole('button', { name: '显示全部结果列', exact: true })).toBeVisible()
  await grid.getByRole('button', { name: '显示全部结果列', exact: true }).click()
  await expect(popover).toBeHidden()
  await expect.poll(() => headerNames(grid)).toEqual(['A', 'B'])
  await page.waitForLoadState('networkidle')
  const readCount = reads.length
  await page.evaluate(
    (tenant) =>
      window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenant })),
    forgedTenant
  )
  await expect(manager).toBeVisible()
  await expect(grid).toContainText('own-A')
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/src/store/modules/tenant-scope.ts'
        const { useTenantScopeStore } = (await import(
          path
        )) as typeof import('../../src/store/modules/tenant-scope')
        const scope = useTenantScopeStore()
        return {
          selected: scope.selectedTenantId,
          effective: scope.effectiveTenantId,
          platform: scope.isPlatformScope
        }
      })
    )
    .toEqual({ selected: forgedTenant, effective: ownTenant, platform: false })
  await page.waitForLoadState('networkidle')
  expect(reads).toHaveLength(readCount)
  expect(reads.every((request) => request.scope !== forgedTenant)).toBe(true)
  expect(columnConfigRequests).toEqual([])
  await expect.poll(() => headerNames(grid)).toEqual(['A', 'B'])
  await page.screenshot({ path: info.outputPath('ordinary-column-policy-restored.png') })
  resultMode.tenantOnly = true
  await manager.getByRole('button', { name: '调用 API', exact: true }).click()
  await expect(grid).toContainText('本次已加载 1 行 · 显示 0/0 列')
  await expect(grid).toContainText('当前没有可显示字段')
  await expect(grid).toContainText('请调整查询，或联系接口维护者返回可展示的业务字段。')
  await expect(grid.getByRole('button', { name: '设置显示列', exact: true })).toHaveCount(0)
  await expect(grid.getByRole('button', { name: '重置列视图', exact: true })).toHaveCount(0)
  await expect(grid.getByRole('button', { name: '显示全部结果列', exact: true })).toHaveCount(0)
  await expect(grid.getByRole('checkbox', { name: 'tenant_id', exact: true })).toHaveCount(0)
  await expect(grid.locator('.art-table')).toHaveCount(0)
  await expect(grid.getByRole('button', { name: '字段统计', exact: true })).toBeVisible()
  await grid.getByRole('button', { name: '编辑副本', exact: true }).click()
  await expect(grid.getByRole('button', { name: '退出编辑', exact: true })).toBeVisible()
  await expect(grid).toContainText('当前没有可显示字段')
  await expect(grid.getByRole('button', { name: '显示全部结果列', exact: true })).toHaveCount(0)
  await grid.getByRole('button', { name: '退出编辑', exact: true }).click()
  await page.screenshot({ path: info.outputPath('ordinary-no-displayable-fields.png') })
  resultMode.tenantOnly = false
  await manager.getByRole('button', { name: '调用 API', exact: true }).click()
  await expect.poll(() => headerNames(grid)).toEqual(['A', 'B'])
  await expect(grid.getByText('当前没有可显示字段', { exact: true })).toHaveCount(0)
  await expect(grid.getByRole('button', { name: '设置显示列', exact: true })).toBeEnabled()
  expect(columnConfigRequests).toEqual([])
  expect(reads.every((request) => request.scope !== forgedTenant)).toBe(true)
  // This fixture checks UI ownership and transport behavior; authenticated database RLS is tested separately.
})

test('duplicate result names disable column controls until a new query supplies unique aliases', async ({
  page
}, info) => {
  const columnConfigRequests = await prepare(page, info.project.name)
  const state = { executions: 0, unique: false }
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    const body = route.request().postDataJSON() as { action?: string }
    if (body.action === 'metadata')
      return route.fulfill({
        json: { schemas: [], tables: [], columns: [], functions: [], foreignKeys: [] }
      })
    state.executions++
    return route.fulfill({
      json: {
        status: 'ok',
        rows: state.unique
          ? [{ x_left: 'left-value', x_right: 'right-value' }]
          : [{ x: 'ambiguous-value' }],
        columns: state.unique
          ? [
              { name: 'x_left', type: 'text' },
              { name: 'x_right', type: 'text' }
            ]
          : [
              { name: 'x', type: 'text' },
              { name: 'x', type: 'text' }
            ],
        rowCount: 1,
        durationMs: 2,
        commandTag: 'SELECT'
      }
    })
  })
  await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=${actor}&tenant=${ownTenant}`
  )
  const editor = page
    .locator('.monaco-editor')
    .getByRole('textbox', { name: 'SQL 编辑器', exact: true })
  await editor.focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText("SELECT 'left-value' AS x, 'right-value' AS x;")
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  const grid = page.locator('.result-table-container')
  await expect(grid).toContainText(
    '结果包含重名字段，列设置暂不可用。请在 SELECT 中使用 AS 指定唯一字段名。'
  )
  await expect(grid.getByRole('button', { name: '设置显示列', exact: true })).toBeDisabled()
  await expect(grid.getByRole('button', { name: '重置列视图', exact: true })).toBeDisabled()
  await page.screenshot({ path: info.outputPath('duplicate-columns-disabled.png') })
  state.unique = true
  await editor.focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText("SELECT 'left-value' AS x_left, 'right-value' AS x_right;")
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await expect.poll(() => headerNames(grid)).toEqual(['x_left', 'x_right'])
  await expect(grid.getByText(/结果包含重名字段/)).toHaveCount(0)
  await expect(grid.getByRole('button', { name: '设置显示列', exact: true })).toBeEnabled()
  const popover = await openColumns(page, grid)
  await expect(popover.getByRole('checkbox')).toHaveCount(2)
  await popover.getByText('x_right', { exact: true }).click()
  await expect.poll(() => headerNames(grid)).toEqual(['x_left'])
  await popover.press('Escape')
  await expect(popover).toBeHidden()
  await expect(grid).toContainText('left-value')
  await grid.getByRole('button', { name: '重置列视图', exact: true }).click()
  await expect(popover).toBeHidden()
  await expect.poll(() => headerNames(grid)).toEqual(['x_left', 'x_right'])
  await expect(grid).toContainText('right-value')
  expect(state.executions).toBe(2)
  expect(columnConfigRequests).toEqual([])
  await page.screenshot({ path: info.outputPath('unique-columns-restored.png') })
})
