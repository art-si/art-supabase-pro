import { expect, test, type Locator, type Page } from '@playwright/test'
import type { SqlHistoryEntry } from '../../src/views/data-center/sql-console/modules/use-sql-workspace'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const actor = '00000000-0000-4000-8000-000000000003'
const tenantA = '00000000-0000-4000-8000-000000000001'
const tenantB = '00000000-0000-4000-8000-000000000002'
const workspaceKey = `sql-console:ckbftoopuyophiebamwy:${actor}:${tenantA}`
const original = "SELECT '原草稿，尚未执行😀' AS original_draft;"
const longSql = `SELECT\n  '完整历史中文😀' AS title,\n  '${'保留长 SQL 与空白 · '.repeat(700)}' AS long_text,\n  'history_full_tail_结束🧪' AS tail;`
const secondSql = "SELECT '另一条历史' AS history_second;"
const entry = (id: string, sql: string, schema?: string): SqlHistoryEntry => ({
  id,
  sql,
  schema,
  executedAt: '2026-10-31T01:00:00Z',
  status: 'ok',
  durationMs: 4,
  rowCount: 1
})
const histories = [entry('long-history', longSql), entry('second-history', secondSql)]
const tabs = (page: Page) =>
  page.getByRole('tablist', { name: 'SQL 查询页签', exact: true }).getByRole('tab')

async function prepare(page: Page, project: string, history = histories) {
  page.setDefaultTimeout(15_000)
  page.setDefaultNavigationTimeout(60_000)
  await prepareIsolatedSession(page)
  const appearance = {
    theme: project.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !project.includes('shadow')
  } as const
  await prepareAppearance(page, appearance)
  await page.addInitScript(
    ({ appearance, workspaceKey, original, history }) => {
      const root = () => {
        document.documentElement.dataset.boxMode = appearance.boxBorderMode
          ? 'border-mode'
          : 'shadow-mode'
        document.documentElement.dataset.uiScope = 'workspace'
      }
      if (document.documentElement) root()
      else document.addEventListener('DOMContentLoaded', root, { once: true })
      if (!localStorage.getItem(workspaceKey))
        localStorage.setItem(workspaceKey, JSON.stringify({ draft: original, history }))
    },
    { appearance, workspaceKey, original, history }
  )
  const state = {
    queries: [] as string[],
    pageErrors: [] as string[],
    gate: undefined as Promise<void> | undefined
  }
  page.on('pageerror', (error) => state.pageErrors.push(error.message))
  await page.route('**/functions/v1/execute-sql-with-columns', async (route) => {
    const body = route.request().postDataJSON() as { action?: string; query?: string }
    if (body.action === 'metadata')
      return route.fulfill({
        json: {
          schemas: ['public'],
          functions: [],
          foreignKeys: [],
          tables: [
            {
              tableSchema: 'public',
              tableName: 'history_sample',
              kind: 'table',
              columns: [
                { name: 'id', dataType: 'integer', isPrimaryKey: true, isNullable: false },
                { name: 'label', dataType: 'text', isNullable: true }
              ]
            }
          ],
          columns: [
            {
              tableSchema: 'public',
              tableName: 'history_sample',
              columnName: 'id',
              dataType: 'integer',
              isPrimaryKey: true,
              isNullable: 'NO',
              ordinalPosition: 1
            },
            {
              tableSchema: 'public',
              tableName: 'history_sample',
              columnName: 'label',
              dataType: 'text',
              isNullable: 'YES',
              ordinalPosition: 2
            }
          ]
        }
      })
    state.queries.push(body.query || '')
    await state.gate
    return route.fulfill({
      json: {
        status: 'ok',
        rows: [{ id: 1, label: 'original-result' }],
        columns: [
          { name: 'id', type: 'integer' },
          { name: 'label', type: 'text' }
        ],
        commandTag: 'SELECT',
        rowCount: 1,
        durationMs: 1
      }
    })
  })
  await page.goto(`/tests/e2e/fixtures/sql-console-metadata.html?actor=${actor}&tenant=${tenantA}`)
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await assertAppearance(page, appearance)
  return state
}

async function editorValue(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/utils/monaco-runtime.ts'
    const { monaco } = (await import(path)) as typeof import('../../src/utils/monaco-runtime')
    const editor = monaco.editor
      .getEditors()
      .find((item) => item.getContainerDomNode()?.closest('.editor-wrapper'))
    if (!editor) throw new Error('SQL editor is not mounted')
    return editor.getValue()
  })
}
async function writeSql(page: Page, sql: string) {
  await page
    .locator('.monaco-editor')
    .getByRole('textbox', { name: 'SQL 编辑器', exact: true })
    .focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(sql)
  await page.keyboard.press('Escape')
}
async function openHistory(page: Page) {
  await page.getByRole('button', { name: '查询历史', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '查询历史', exact: true })
  await expect(drawer).toBeVisible()
  return drawer
}
async function preview(drawer: Locator, sqlText: string) {
  const card = drawer.locator('.sql-history-button').filter({ hasText: sqlText })
  await card.click()
  await expect(card).toHaveAttribute('aria-expanded', 'true')
  const region = drawer.getByRole('region', { name: '历史 SQL 预览', exact: true })
  await expect(region).toBeVisible()
  return region
}
async function dirtyResult(page: Page) {
  await writeSql(page, 'SELECT id, label FROM public.history_sample;')
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  const grid = page.locator('.result-table-container')
  await expect(grid).toContainText('original-result')
  await grid.getByRole('button', { name: '编辑副本', exact: true }).click()
  await grid.getByRole('button', { name: '编辑第 1 行 label', exact: true }).dblclick()
  await page.getByRole('textbox', { name: '编辑值 label', exact: true }).fill('保留结果副本修改')
  await page.getByRole('button', { name: '保留修改', exact: true }).click()
  await expect(grid).toContainText('已修改 1 行 / 1 处')
  return grid
}

test('history previews are read-only and full SQL opens in a new tab without replacing the original draft', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name)
  await expect.poll(() => editorValue(page)).toBe(original)
  let drawer = await openHistory(page)
  let region = await preview(drawer, 'history_full_tail_结束🧪')
  expect(await region.getByLabel('历史 SQL 预览代码', { exact: true }).textContent()).toBe(longSql)
  await expect.poll(() => editorValue(page)).toBe(original)
  expect(state.queries).toEqual([])
  region = await preview(drawer, 'history_second')
  await expect(drawer.getByRole('region', { name: '历史 SQL 预览', exact: true })).toHaveCount(1)
  expect(await region.getByLabel('历史 SQL 预览代码', { exact: true }).textContent()).toBe(
    secondSql
  )
  region = await preview(drawer, 'history_full_tail_结束🧪')
  for (const label of ['在新页签打开', '载入当前页签']) {
    const action = region.getByRole('button', { name: label, exact: true })
    await action.scrollIntoViewIfNeeded()
    await expect(action).toBeInViewport({ ratio: 1 })
    expect((await action.boundingBox())?.height).toBe(24)
  }
  expect(
    await drawer
      .locator('.art-drawer__content')
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
  ).toBe(true)
  await page.screenshot({
    path: info.outputPath('history-full-preview.png'),
    animations: 'disabled'
  })
  await region.getByRole('button', { name: '在新页签打开', exact: true }).click()
  await expect(drawer).toHaveCount(0)
  await expect(tabs(page)).toHaveCount(2)
  await expect.poll(() => editorValue(page)).toBe(longSql)
  expect(state.queries).toEqual([])
  await tabs(page).first().click()
  await expect.poll(() => editorValue(page)).toBe(original)
  drawer = await openHistory(page)
  region = await preview(drawer, 'history_second')
  await region.getByRole('button', { name: '载入当前页签', exact: true }).click()
  await expect(drawer).toHaveCount(0)
  await expect.poll(() => editorValue(page)).toBe(secondSql)
  await page.getByRole('button', { name: '撤销 SQL 编辑', exact: true }).click()
  await expect.poll(() => editorValue(page)).toBe(original)
  expect(state.queries).toEqual([])
  expect(state.pageErrors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
})

test('executing previews stay inert, searches distinguish empty history and capacity rejects before discarding a result copy', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name)
  let release!: () => void
  state.gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await expect.poll(() => state.queries.length).toBe(1)
  let drawer = await openHistory(page)
  let region = await preview(drawer, 'history_second')
  await expect(region.getByRole('button', { name: '在新页签打开', exact: true })).toBeDisabled()
  await expect(region.getByRole('button', { name: '载入当前页签', exact: true })).toBeDisabled()
  await expect(drawer).toContainText('查询正在执行，完成或取消后可载入历史。')
  await expect.poll(() => editorValue(page)).toBe(original)
  release()
  state.gate = undefined
  await expect(region.getByRole('button', { name: '在新页签打开', exact: true })).toBeEnabled()
  await drawer.getByRole('button', { name: '关闭', exact: true }).last().click()
  for (let index = 0; index < 7; index++)
    await page.getByRole('button', { name: '新建查询页签', exact: true }).click()
  await expect(tabs(page)).toHaveCount(8)
  await tabs(page).first().click()
  const grid = await dirtyResult(page)
  drawer = await openHistory(page)
  region = await preview(drawer, 'history_second')
  await expect(region.getByRole('button', { name: '在新页签打开', exact: true })).toBeDisabled()
  await expect(region.getByRole('button', { name: '载入当前页签', exact: true })).toBeEnabled()
  await expect(drawer).toContainText('8 个查询页签')
  await expect(page.getByRole('dialog', { name: '离开结果编辑', exact: true })).toHaveCount(0)
  await expect(tabs(page)).toHaveCount(8)
  await expect(grid).toContainText('保留结果副本修改')
  await expect.poll(() => editorValue(page)).toBe('SELECT id, label FROM public.history_sample;')
  if (!(await drawer.isVisible())) drawer = await openHistory(page)
  await drawer.getByRole('textbox', { name: '搜索查询历史', exact: true }).fill('no-such-history')
  await expect(drawer).toContainText('没有匹配的历史')
  await expect(drawer.getByRole('region', { name: '历史 SQL 预览', exact: true })).toHaveCount(0)
  await drawer.getByRole('button', { name: '关闭', exact: true }).last().click()
  await page.evaluate(
    (tenant) =>
      window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenant })),
    tenantB
  )
  drawer = await openHistory(page)
  await expect(drawer).toContainText('暂无查询历史')
  expect(state.queries).toHaveLength(2)
  expect(state.pageErrors).toEqual([])
})

test('explicit history actions respect dirty-result cancellation and late scope confirmations cannot restore SQL', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name)
  const grid = await dirtyResult(page)
  const source = await editorValue(page)
  let drawer = await openHistory(page)
  let region = await preview(drawer, 'history_second')
  await region.getByRole('button', { name: '载入当前页签', exact: true }).click()
  const leave = page.getByRole('dialog', { name: '离开结果编辑', exact: true })
  await expect(leave).toBeVisible()
  await leave.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(grid).toContainText('保留结果副本修改')
  await expect.poll(() => editorValue(page)).toBe(source)
  drawer = await openHistory(page)
  region = await preview(drawer, 'history_second')
  await region.getByRole('button', { name: '载入当前页签', exact: true }).click()
  await leave.getByRole('button', { name: '放弃修改并继续', exact: true }).click()
  await expect.poll(() => editorValue(page)).toBe(secondSql)
  await expect(page.locator('.result-table-container')).toHaveCount(0)
  await page.getByRole('button', { name: '撤销 SQL 编辑', exact: true }).click()
  await expect.poll(() => editorValue(page)).toBe(source)
  await dirtyResult(page)
  drawer = await openHistory(page)
  region = await preview(drawer, 'history_second')
  await region.getByRole('button', { name: '在新页签打开', exact: true }).click()
  await leave.getByRole('button', { name: '放弃修改并继续', exact: true }).click()
  await expect(tabs(page)).toHaveCount(2)
  await expect.poll(() => editorValue(page)).toBe(secondSql)
  await tabs(page).first().click()
  await expect.poll(() => editorValue(page)).toBe(source)
  await dirtyResult(page)
  drawer = await openHistory(page)
  region = await preview(drawer, 'history_second')
  await region.getByRole('button', { name: '载入当前页签', exact: true }).click()
  await expect(leave).toBeVisible()
  await page.evaluate(
    ({ tenantA, tenantB }) => {
      for (const tenant of [tenantB, tenantA])
        window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenant }))
    },
    { tenantA, tenantB }
  )
  await leave.getByRole('button', { name: '放弃修改并继续', exact: true }).click()
  await expect(drawer).toHaveCount(0)
  await expect(tabs(page)).toHaveCount(2)
  await expect.poll(() => editorValue(page)).toBe(source)
  // The scope returns to A in the same turn. Rejecting the stale confirmation
  // must preserve A's existing result copy rather than applying its discard.
  await expect(grid).toContainText('保留结果副本修改')
  await expect(grid).toContainText('已修改 1 行 / 1 处')
  drawer = await openHistory(page)
  region = await preview(drawer, 'history_second')
  // Dispatch both scope changes in the same event turn as the real button's
  // click handler, before its pending Drawer closed action can be applied.
  await region.getByRole('button', { name: '载入当前页签', exact: true }).evaluate(
    (button, scopes) => {
      if (!(button instanceof HTMLButtonElement) || button.disabled)
        throw new Error('History restore is not actionable')
      button.click()
      for (const tenant of scopes)
        window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenant }))
    },
    [tenantB, tenantA]
  )
  await expect(drawer).toHaveCount(0)
  await expect.poll(() => editorValue(page)).toBe(source)
  await expect(tabs(page)).toHaveCount(2)
  expect(state.queries).toHaveLength(3)
  expect(state.pageErrors).toEqual([])
})

test('DM history restores its saved or default schema and offline new-tab actions never fall back to Supabase', async ({
  page
}, info) => {
  const dmId = '00000000-0000-4000-8000-000000000011'
  const base = 'http://127.0.0.1:4319'
  const dm = {
    id: dmId,
    name: '历史 DM 隔离库',
    dialect: 'dm',
    host: 'localhost',
    port: 5236,
    database: 'DMTEST',
    username: 'reader',
    tls: false,
    enabled: true,
    tenantId: tenantA,
    allowedUserIds: [],
    updatedAt: '2026-10-31T00:00:00Z'
  }
  const sourceKey = `${workspaceKey}:${base}:${dmId}:localhost:5236:DMTEST:reader:dm-main`
  const offlineKey = `${workspaceKey}:${base}:${dmId}:offline:dm-main`
  const schemaSql = "SELECT 'schema_history' AS note FROM DUAL;"
  const defaultSql = "SELECT 'default_schema_history' AS note FROM DUAL;"
  const dmHistory = [entry('dm-schema', schemaSql, 'ARCHIVE'), entry('dm-default', defaultSql)]
  await page.addInitScript(
    ({ actor, tenantA, dmId, sourceKey, offlineKey, original, dmHistory }) => {
      localStorage.setItem(
        `sql-query-tabs:${actor}:${tenantA}`,
        JSON.stringify({
          active: 'dm-main',
          tabs: [{ id: 'dm-main', connectionId: dmId, label: '历史 DM 隔离库' }]
        })
      )
      for (const key of [sourceKey, offlineKey])
        localStorage.setItem(
          key,
          JSON.stringify({ draft: original, querySchema: 'APP', history: dmHistory })
        )
    },
    { actor, tenantA, dmId, sourceKey, offlineKey, original, dmHistory }
  )
  let offline = false
  let rejectedSnapshots = 0
  const externalQueries: string[] = []
  await page.route(`${base}/**`, (route) => {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization,content-type,x-art-tenant-scope'
    }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const path = new URL(route.request().url()).pathname
    if (path === '/snapshot') {
      if (offline) {
        rejectedSnapshots++
        return route.fulfill({
          status: 503,
          headers,
          json: { message: '执行端暂不可用，请重试', code: 'PLATFORM_IDENTITY_UNAVAILABLE' }
        })
      }
      return route.fulfill({ headers, json: { connections: [dm], users: [], canManage: true } })
    }
    if (path.endsWith('/metadata'))
      return route.fulfill({
        headers,
        json: {
          schemas: ['APP', 'ARCHIVE'],
          tables: [],
          columns: [],
          functions: [],
          foreignKeys: []
        }
      })
    if (path.endsWith('/query')) externalQueries.push(path)
    return route.abort()
  })
  const state = await prepare(page, info.project.name, [])
  const schema = page.getByRole('combobox', { name: '当前查询 schema', exact: true })
  await expect(schema).toBeVisible()
  await expect(page.locator('.sql-target-context__schema')).toContainText('APP')
  let drawer = await openHistory(page)
  let region = await preview(drawer, schemaSql)
  await region.getByRole('button', { name: '在新页签打开', exact: true }).click()
  await expect(tabs(page)).toHaveCount(2)
  await expect.poll(() => editorValue(page)).toBe(schemaSql)
  await expect(page.locator('.sql-target-context__schema')).toContainText('ARCHIVE')
  await tabs(page).first().click()
  await expect.poll(() => editorValue(page)).toBe(original)
  await expect(page.locator('.sql-target-context__schema')).toContainText('APP')
  drawer = await openHistory(page)
  region = await preview(drawer, schemaSql)
  await region.getByRole('button', { name: '载入当前页签', exact: true }).click()
  await expect.poll(() => editorValue(page)).toBe(schemaSql)
  await expect(page.locator('.sql-target-context__schema')).toContainText('ARCHIVE')
  drawer = await openHistory(page)
  region = await preview(drawer, defaultSql)
  await region.getByRole('button', { name: '载入当前页签', exact: true }).click()
  await expect.poll(() => editorValue(page)).toBe(defaultSql)
  await expect(page.locator('.sql-target-context__schema')).not.toContainText('ARCHIVE')
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || '{}').querySchema,
      sourceKey
    )
  ).toBe('')
  offline = true
  await page.reload()
  await expect.poll(() => rejectedSnapshots).toBeGreaterThan(0)
  await expect(page.locator('.sql-target-context')).toContainText('连接未就绪')
  drawer = await openHistory(page)
  region = await preview(drawer, schemaSql)
  await expect(region.getByRole('button', { name: '在新页签打开', exact: true })).toBeDisabled()
  await expect(region.getByRole('button', { name: '载入当前页签', exact: true })).toBeDisabled()
  await expect(drawer).toContainText('连接未就绪')
  await expect(tabs(page)).toHaveCount(1)
  await expect(page.locator('.sql-query-bar__connection')).toContainText('连接未就绪')
  await expect.poll(() => editorValue(page)).toBe(original)
  expect(externalQueries).toEqual([])
  expect(state.queries).toEqual([])
  // The intentionally mocked /snapshot 503 is expected; no browser page error is expected.
  expect(state.pageErrors).toEqual([])
})
