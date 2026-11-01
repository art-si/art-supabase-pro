import { expect, test, type Page, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const actor = '00000000-0000-4000-8000-000000000063'
const tenantA = '00000000-0000-4000-8000-000000000061'
const tenantB = '00000000-0000-4000-8000-000000000062'
const gateway = 'http://127.0.0.1:4319'
const connectionId = '00000000-0000-4000-8000-000000000064'
const originalSql = 'SELECT id, label FROM public.orders;'
const proposedSql = "SELECT id, label FROM public.orders WHERE label = 'AI候选';"
const workspaceKey = `sql-console:ckbftoopuyophiebamwy:${actor}:${tenantA}`
const tabsKey = `sql-query-tabs:${actor}:${tenantA}`
const endpoint = '**/functions/v1/execute-sql-with-columns'
const emptyMetadata = {
  schemas: ['public'],
  tables: [],
  columns: [],
  functions: [],
  foreignKeys: []
}
const table = {
  tableSchema: 'public',
  tableName: 'orders',
  kind: 'table',
  description: '订单',
  detailsLoaded: false,
  columnCount: 2,
  columns: [],
  indexes: []
}
const columns = ['id', 'label'].map((columnName, index) => ({
  tableSchema: 'public',
  tableName: 'orders',
  columnName,
  dataType: index ? 'text' : 'integer',
  ordinalPosition: index + 1,
  isNullable: index ? 'YES' : 'NO',
  isPrimaryKey: !index
}))

interface RequestBody {
  action?: string
  mode?: string
  prompt?: string
  query?: string
  currentSql?: string
  dialect?: string
  schema?: string
  connectionKind?: string
  requestId?: string
}
interface Reply {
  status?: number
  body: Record<string, unknown>
  wait?: Promise<void>
}
interface Options {
  plans?: Reply[]
  ai?: Reply[]
  cancellations?: Reply[]
  ordinary?: boolean
  external?: boolean
  eightTabs?: boolean
}

function deferred() {
  let release!: () => void
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  return { wait, release }
}
const plan = (label: string): Record<string, unknown> => ({
  status: 'ok',
  plan: [{ Plan: { 'Node Type': label, 'Total Cost': 12.5, 'Plan Rows': 3 } }],
  estimatedCost: 12.5,
  estimatedRows: 3
})
const ai = (sql = proposedSql): Record<string, unknown> => ({
  sql,
  summary: '已生成候选，请审阅后载入',
  warnings: ['请确认筛选条件'],
  model: 'isolated-fixture-model'
})
const explainButton = (page: Page) =>
  page.getByRole('button', { name: '查看执行计划', exact: true })
const planDrawer = (page: Page) => page.getByRole('dialog', { name: '执行计划', exact: true })
const aiDialog = (page: Page) => page.getByRole('dialog', { name: 'AI SQL 助手', exact: true })
const proposal = (page: Page) => page.getByRole('region', { name: 'AI SQL 生成结果', exact: true })
const tabs = (page: Page) =>
  page.getByRole('tablist', { name: 'SQL 查询页签', exact: true }).getByRole('tab')
const prompt = (page: Page) =>
  aiDialog(page).getByPlaceholder('例如：查出最近 30 天注册且已启用的用户，按创建时间倒序')

async function prepare(page: Page, project: string, options: Options = {}) {
  page.setDefaultTimeout(15_000)
  page.setDefaultNavigationTimeout(60_000)
  await prepareIsolatedSession(page)
  const appearance = {
    theme: project.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !project.includes('shadow')
  } as const
  await prepareAppearance(page, appearance)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const activeWorkspace = options.external
    ? `${workspaceKey}:${gateway}:${connectionId}:localhost:5432:ownership:reader:external-main`
    : workspaceKey
  await page.addInitScript(
    ({ tenantA, tabsKey, activeWorkspace, originalSql, connectionId, options, appearance }) => {
      sessionStorage.setItem('art-platform-tenant-scope-active', '1')
      sessionStorage.setItem('art-platform-tenant-scope-id', tenantA)
      localStorage.setItem(activeWorkspace, JSON.stringify({ draft: originalSql }))
      if (options.external || options.eightTabs)
        localStorage.setItem(
          tabsKey,
          JSON.stringify({
            active: options.external ? 'external-main' : 'main',
            tabs: options.external
              ? [{ id: 'external-main', connectionId, label: '计划隔离库' }]
              : Array.from({ length: 8 }, (_, index) => ({
                  id: index ? `reserved-${index}` : 'main',
                  connectionId: 'builtin',
                  label: index ? `保留查询 ${index}` : '当前 Supabase'
                }))
          })
        )
      const applyAppearance = () => {
        document.documentElement.dataset.boxMode = appearance.boxBorderMode
          ? 'border-mode'
          : 'shadow-mode'
        document.documentElement.dataset.uiScope = 'workspace'
      }
      if (document.documentElement) applyAppearance()
      else document.addEventListener('DOMContentLoaded', applyAppearance, { once: true })
    },
    {
      tenantA,
      tabsKey,
      activeWorkspace,
      originalSql,
      connectionId,
      appearance,
      options: {
        external: options.external,
        eightTabs: options.eightTabs
      }
    }
  )
  const state = {
    plans: [] as RequestBody[],
    ai: [] as RequestBody[],
    cancellations: [] as RequestBody[],
    metadata: [] as RequestBody[],
    planReplies: 0,
    aiReplies: 0,
    cancelReplies: 0,
    executions: 0,
    errors: [] as string[],
    metadataWait: undefined as Promise<void> | undefined,
    connection: {
      id: connectionId,
      name: '计划隔离库',
      dialect: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'ownership',
      username: 'reader',
      tls: false,
      enabled: true,
      tenantId: tenantA,
      allowedUserIds: [],
      updatedAt: '2026-10-31T00:00:00Z'
    }
  }
  page.on('pageerror', (error) => state.errors.push(error.message))
  const fulfill = async (route: Route, reply: Reply | undefined, headers = {}) => {
    if (!reply) throw new Error('Unexpected SQL ownership fixture request')
    await reply.wait
    await route.fulfill({ status: reply.status ?? 200, json: reply.body, headers })
  }
  const metadata = async (route: Route, body: RequestBody, headers = {}) => {
    state.metadata.push(body)
    if (body.mode === 'tables') await state.metadataWait
    await route.fulfill({
      headers,
      json: {
        ...emptyMetadata,
        metadataMode: body.mode,
        tables: [{ ...table, detailsLoaded: body.mode === 'tables' }],
        columns: body.mode === 'tables' || options.external ? columns : []
      }
    })
  }
  const query = async (route: Route, body: RequestBody, headers = {}) => {
    if (body.action === 'cancel') {
      state.cancellations.push(body)
      await fulfill(route, options.cancellations?.[state.cancellations.length - 1], headers)
      state.cancelReplies++
    } else if (body.action === 'explain') {
      state.plans.push(body)
      const reply = options.plans?.[state.plans.length - 1]
      if (options.external && reply?.status === undefined) {
        await fulfill(
          route,
          {
            ...reply,
            body: {
              status: 'ok',
              rows: [{ 'QUERY PLAN': reply.body.plan }],
              columns: [{ name: 'QUERY PLAN' }],
              commandTag: 'EXPLAIN',
              rowCount: 1,
              truncated: false,
              durationMs: 2,
              maxRows: 200,
              timeoutMs: 10000
            }
          },
          headers
        )
      } else await fulfill(route, reply, headers)
      state.planReplies++
    } else {
      state.executions++
      await route.fulfill({
        headers,
        json: {
          status: 'ok',
          rows: [{ id: 1, label: 'original-result' }],
          columns: [
            { name: 'id', type: 'integer' },
            { name: 'label', type: 'text' }
          ],
          rowCount: 1,
          durationMs: 2,
          commandTag: 'SELECT'
        }
      })
    }
  }
  await page.route(endpoint, (route) => {
    const body = route.request().postDataJSON() as RequestBody
    return body.action === 'metadata' ? metadata(route, body) : query(route, body)
  })
  await page.route('**/functions/v1/ai-sql-assistant', async (route) => {
    state.ai.push(route.request().postDataJSON() as RequestBody)
    await fulfill(route, options.ai?.[state.ai.length - 1])
    state.aiReplies++
  })
  await page.route(`${gateway}/**`, async (route) => {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization,content-type,x-art-tenant-scope'
    }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const path = new URL(route.request().url()).pathname
    if (path === '/snapshot')
      return route.fulfill({
        headers,
        json: { connections: [state.connection], users: [], canManage: true }
      })
    const body = route.request().postDataJSON() as RequestBody
    if (path.endsWith('/metadata')) return metadata(route, body, headers)
    if (path.endsWith('/cancel')) return query(route, { ...body, action: 'cancel' }, headers)
    if (path.endsWith('/query')) return query(route, body, headers)
    throw new Error(`Unexpected SQL ownership gateway path: ${path}`)
  })
  await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=${actor}&tenant=${tenantA}${options.ordinary ? '&ordinary=1' : ''}`
  )
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await assertAppearance(page, appearance)
  await expect.poll(() => editorValue(page)).toBe(originalSql)
  if (options.external)
    await expect(page.locator('.sql-target-context')).toContainText('计划隔离库')
  return { state, activeWorkspace }
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
async function editSql(page: Page, sql: string) {
  // Monaco is edited through its normal undoable edit API, including while an
  // overlay owns focus, as a concurrent editor update would be.
  await page.evaluate(async (sql) => {
    const path = '/src/utils/monaco-runtime.ts'
    const { monaco } = (await import(path)) as typeof import('../../src/utils/monaco-runtime')
    const editor = monaco.editor
      .getEditors()
      .find((item) => item.getContainerDomNode()?.closest('.editor-wrapper'))
    const model = editor?.getModel()
    if (!editor || !model) throw new Error('SQL editor is not mounted')
    editor.pushUndoStop()
    editor.executeEdits('ownership-fixture', [{ range: model.getFullModelRange(), text: sql }])
    editor.pushUndoStop()
  }, sql)
  await expect.poll(() => editorValue(page)).toBe(sql)
}
async function changeScope(page: Page, scopes: string[]) {
  await page.evaluate((scopes) => {
    for (const tenant of scopes)
      window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenant }))
  }, scopes)
}
async function openAi(page: Page, text = '按订单标签查询') {
  await page.getByRole('button', { name: 'AI 写 SQL', exact: true }).click()
  await expect(aiDialog(page)).toBeVisible()
  await prompt(page).fill(text)
  await aiDialog(page).getByRole('button', { name: '生成 SQL', exact: true }).click()
}
async function expectProposal(page: Page, sql = proposedSql) {
  await expect(proposal(page)).toBeVisible()
  expect(await proposal(page).getByLabel('AI SQL 预览代码', { exact: true }).textContent()).toBe(
    sql
  )
  await expect(aiDialog(page)).toBeVisible()
}
async function closeAi(page: Page) {
  await aiDialog(page).getByRole('button', { name: '关闭弹窗', exact: true }).click()
  await expect(aiDialog(page)).toHaveCount(0)
}
async function dirtyResult(page: Page) {
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  const grid = page.locator('.result-table-container')
  await expect(grid).toContainText('original-result')
  await grid.getByRole('button', { name: '编辑副本', exact: true }).click()
  await grid.getByRole('button', { name: '编辑第 1 行 label', exact: true }).dblclick()
  await page.getByRole('textbox', { name: '编辑值 label', exact: true }).fill('保留副本修改')
  await page.getByRole('button', { name: '保留修改', exact: true }).click()
  await expect(grid).toContainText('已修改 1 行 / 1 处')
  return grid
}

test('plan success, cancel retry and terminal cancellation retain independent request identities', async ({
  page
}, info) => {
  const terminal = deferred()
  const { state } = await prepare(page, info.project.name, {
    plans: [
      { body: plan('first-plan') },
      {
        wait: terminal.wait,
        status: 409,
        body: { status: 'error', errorCode: 'SQL_QUERY_CANCELLED', message: '查询已取消' }
      },
      { body: plan('retried-plan') }
    ],
    cancellations: [
      { status: 503, body: { message: '取消查询失败，请重试或等待查询结束' } },
      { body: { status: 'ok', state: 'cancel_requested' } }
    ]
  })
  await explainButton(page).click()
  const drawer = planDrawer(page)
  await expect(drawer).toContainText('first-plan')
  expect(await drawer.getByLabel('本次分析的 SQL代码', { exact: true }).textContent()).toBe(
    originalSql
  )
  await drawer.getByRole('button', { name: '重新分析', exact: true }).click()
  await expect.poll(() => state.plans.length).toBe(2)
  await drawer.getByRole('button', { name: '取消分析', exact: true }).click()
  await expect(page.getByText('取消查询失败，请重试或等待查询结束', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: '取消分析', exact: true })).toBeEnabled()
  await drawer.getByRole('button', { name: '取消分析', exact: true }).click()
  await expect(drawer.getByRole('button', { name: '等待数据库结束…', exact: true })).toBeDisabled()
  expect(state.cancellations.map((request) => request.requestId)).toEqual([
    state.plans[1].requestId,
    state.plans[1].requestId
  ])
  terminal.release()
  await expect(drawer.getByText('分析已取消', { exact: true })).toBeVisible()
  await drawer.getByRole('button', { name: '重新分析', exact: true }).click()
  await expect(drawer).toContainText('retried-plan')
  expect(new Set(state.plans.map((request) => request.requestId)).size).toBe(3)
  expect(state.executions).toBe(0)
  expect(state.errors).toEqual([])
  await page.screenshot({ path: info.outputPath('plan-retry-ready.png') })
})

test('same-turn tenant ABA invalidates the old plan, cancel acknowledgement and finally', async ({
  page
}, info) => {
  const old = deferred()
  const ack = deferred()
  const current = deferred()
  const { state } = await prepare(page, info.project.name, {
    plans: [
      { wait: old.wait, body: plan('stale-plan') },
      { wait: current.wait, body: plan('current-plan') }
    ],
    cancellations: [{ wait: ack.wait, body: { status: 'ok', state: 'cancel_requested' } }]
  })
  await explainButton(page).click()
  await expect.poll(() => state.plans.length).toBe(1)
  await planDrawer(page).getByRole('button', { name: '取消分析', exact: true }).click()
  await expect.poll(() => state.cancellations.length).toBe(1)
  await changeScope(page, [tenantB, tenantA])
  await expect(planDrawer(page)).toHaveCount(0)
  await expect(explainButton(page)).toBeEnabled()
  await explainButton(page).click()
  await expect.poll(() => state.plans.length).toBe(2)
  ack.release()
  await expect.poll(() => state.cancelReplies).toBe(1)
  await expect(
    planDrawer(page).getByRole('button', { name: '取消分析', exact: true })
  ).toBeEnabled()
  old.release()
  await expect.poll(() => state.planReplies).toBe(1)
  await expect(planDrawer(page)).not.toContainText('stale-plan')
  await expect(
    planDrawer(page).getByRole('button', { name: '取消分析', exact: true })
  ).toBeEnabled()
  current.release()
  await expect(planDrawer(page)).toContainText('current-plan')
  expect(state.errors).toEqual([])
})

test('role ABA, schema storage and refreshed connection configuration close pending plans', async ({
  page
}, info) => {
  const gates = [deferred(), deferred(), deferred()]
  const { state, activeWorkspace } = await prepare(page, info.project.name, {
    external: true,
    plans: [
      ...gates.map((gate, index) => ({ wait: gate.wait, body: plan(`stale-owner-${index}`) })),
      { body: plan('latest-config-plan') }
    ]
  })
  for (let index = 0; index < gates.length; index++) {
    await explainButton(page).click()
    await expect.poll(() => state.plans.length).toBe(index + 1)
    if (index === 0) {
      await page.evaluate(async () => {
        const path = '/src/store/modules/user.ts'
        const { useUserStore } = (await import(
          path
        )) as typeof import('../../src/store/modules/user')
        const user = useUserStore()
        const info = { ...user.getUserInfo }
        user.setUserInfo({ ...info, platformSuper: false })
        user.setUserInfo({ ...info, platformSuper: true })
      })
    } else if (index === 1) {
      await page.evaluate((key) => {
        const peer = window.open('about:blank', '_blank')
        if (!peer) throw new Error('Could not open same-origin storage peer')
        const saved: Record<string, unknown> = JSON.parse(peer.localStorage.getItem(key) || '{}')
        peer.localStorage.setItem(key, JSON.stringify({ ...saved, querySchema: 'archive' }))
        peer.close()
      }, activeWorkspace)
    } else {
      // Refresh can arrive from another surface while the plan drawer owns focus.
      await page.getByRole('button', { name: '连接管理', exact: true }).evaluate((element) => {
        if (!(element instanceof HTMLButtonElement)) throw new Error('Expected connection button')
        element.click()
      })
      const manager = page.getByRole('dialog', { name: '数据库连接', exact: true })
      state.connection.updatedAt = '2026-10-31T00:01:00Z'
      await manager.getByRole('button', { name: '刷新连接', exact: true }).click()
      await expect(manager.getByRole('button', { name: '刷新连接', exact: true })).toBeEnabled()
      await manager.getByRole('button', { name: '关闭', exact: true }).last().click()
    }
    await expect(planDrawer(page)).toHaveCount(0)
    await expect(explainButton(page)).toBeEnabled()
    gates[index].release()
    await expect.poll(() => state.planReplies).toBe(index + 1)
    await expect(planDrawer(page)).toHaveCount(0)
  }
  await explainButton(page).click()
  await expect(planDrawer(page)).toContainText('latest-config-plan')
  expect(state.executions).toBe(0)
  expect(state.errors).toEqual([])
})

test('AI snapshots prompt and SQL before metadata, then previews without overwriting or executing', async ({
  page
}, info) => {
  const details = deferred()
  const { state } = await prepare(page, info.project.name, { ai: [{ body: ai() }] })
  state.metadataWait = details.wait
  await openAi(page, 'snapshot订单需求')
  await expect
    .poll(() => state.metadata.filter((request) => request.mode === 'tables').length)
    .toBeGreaterThan(0)
  await expect(prompt(page)).toBeDisabled()
  await expect(aiDialog(page).getByRole('radio', { name: '修复 SQL', exact: true })).toBeDisabled()
  await expect(aiDialog(page).getByRole('button', { name: '生成 SQL', exact: true })).toBeDisabled()
  const changedSql = "SELECT '生成期间编辑的原稿' AS label;"
  await editSql(page, changedSql)
  // A synthetic model update stresses the snapshot even though disabled inputs
  // prevent a user from changing this value during normal generation.
  await prompt(page).evaluate((element) => {
    if (!(element instanceof HTMLTextAreaElement)) throw new Error('Expected AI prompt textarea')
    element.value = 'later-model-update'
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
  details.release()
  await expectProposal(page)
  expect(state.ai).toHaveLength(1)
  expect(state.ai[0]).toMatchObject({
    prompt: 'snapshot订单需求',
    mode: 'generate',
    currentSql: originalSql,
    dialect: 'postgres',
    connectionKind: 'builtin'
  })
  expect(state.ai[0].schema).toBeUndefined()
  await expect.poll(() => editorValue(page)).toBe(changedSql)
  await expect(proposal(page)).toContainText('生成期间编辑过的 SQL 草稿已保留')
  expect(state.executions).toBe(0)
  expect(state.errors).toEqual([])
  await page.screenshot({ path: info.outputPath('ai-preview-source-changed.png') })
})

test('ordinary users keep edited drafts, copy full proposals, open new tabs and explicitly apply with Undo', async ({
  page
}, info) => {
  const generated = deferred()
  const fullSql = `${proposedSql}\n${'-- 完整候选预览\n'.repeat(80)}-- ai_full_tail_结束🧪`
  const { state } = await prepare(page, info.project.name, {
    ordinary: true,
    ai: [{ wait: generated.wait, body: ai(fullSql) }, { body: ai() }]
  })
  await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toBeDisabled()
  await openAi(page)
  await expect.poll(() => state.ai.length).toBe(1)
  const edited = "SELECT '普通用户保留稿' AS label;"
  await editSql(page, edited)
  generated.release()
  await expectProposal(page, fullSql)
  await expect(proposal(page)).toContainText('生成期间编辑过的 SQL 草稿已保留')
  await page.screenshot({
    path: info.outputPath('ai-ordinary-full-preview.png'),
    animations: 'disabled'
  })
  await proposal(page).getByRole('button', { name: '复制 SQL', exact: true }).click()
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(
    fullSql
  )
  await proposal(page)
    .getByRole('button', { name: '在新页签打开', exact: true })
    .scrollIntoViewIfNeeded()
  for (const name of ['在新页签打开', '载入当前页签'])
    await expect(proposal(page).getByRole('button', { name, exact: true })).toBeInViewport({
      ratio: 1
    })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({
    path: info.outputPath('ai-ordinary-preview-actions.png'),
    animations: 'disabled'
  })
  await proposal(page).getByRole('button', { name: '在新页签打开', exact: true }).click()
  await expect(tabs(page)).toHaveCount(2)
  await expect.poll(() => editorValue(page)).toBe(fullSql)
  await tabs(page).first().click()
  await expect.poll(() => editorValue(page)).toBe(edited)
  await openAi(page)
  await expectProposal(page)
  await expect.poll(() => editorValue(page)).toBe(edited)
  await proposal(page).getByRole('button', { name: '载入当前页签', exact: true }).click()
  await expect.poll(() => editorValue(page)).toBe(proposedSql)
  await page.getByRole('button', { name: '撤销 SQL 编辑', exact: true }).click()
  await expect.poll(() => editorValue(page)).toBe(edited)
  await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toBeDisabled()
  expect(state.executions).toBe(0)
  expect(state.plans).toHaveLength(0)
  expect(state.errors).toEqual([])
})

test('eight tabs only block new-tab loading; dirty-result cancellation and delayed confirmation preserve SQL', async ({
  page
}, info) => {
  const reopened = deferred()
  const { state } = await prepare(page, info.project.name, {
    eightTabs: true,
    ai: [{ body: ai() }, { body: ai() }, { wait: reopened.wait, body: ai() }]
  })
  const grid = await dirtyResult(page)
  await openAi(page)
  await expectProposal(page)
  await expect(
    proposal(page).getByRole('button', { name: '在新页签打开', exact: true })
  ).toBeDisabled()
  const apply = proposal(page).getByRole('button', { name: '载入当前页签', exact: true })
  await expect(apply).toBeEnabled()
  await apply.click()
  const leave = page.getByRole('dialog', { name: '离开结果编辑', exact: true })
  await leave.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expectProposal(page)
  await expect(grid).toContainText('保留副本修改')
  await expect.poll(() => editorValue(page)).toBe(originalSql)
  await apply.click()
  await expect(leave).toBeVisible()
  await expect(prompt(page)).toBeDisabled()
  const newerDraft = "SELECT '确认期间继续编辑' AS label;"
  await editSql(page, newerDraft)
  await editSql(page, originalSql)
  await leave.getByRole('button', { name: '放弃修改并继续', exact: true }).click()
  await expect.poll(() => editorValue(page)).toBe(originalSql)
  await expectProposal(page)
  await apply.click()
  if (await leave.isVisible())
    await leave.getByRole('button', { name: '放弃修改并继续', exact: true }).click()
  await expect.poll(() => editorValue(page)).toBe(proposedSql)
  await expect(grid).toHaveCount(0)
  await expect(tabs(page)).toHaveCount(8)
  await page.getByRole('button', { name: '撤销 SQL 编辑', exact: true }).click()
  await expect.poll(() => editorValue(page)).toBe(originalSql)
  await page.getByRole('button', { name: '关闭查询页签 8', exact: true }).click()
  await dirtyResult(page)
  await openAi(page)
  await expectProposal(page)
  await proposal(page).getByRole('button', { name: '在新页签打开', exact: true }).click()
  await expect(leave).toBeVisible()
  // Resolve the underlying dialog lifecycle while its leave confirmation is
  // pending, then resolve that old confirmation after a new generation starts.
  await aiDialog(page)
    .getByRole('button', { name: '关闭弹窗', exact: true })
    .evaluate((element) => {
      if (!(element instanceof HTMLButtonElement)) throw new Error('Expected AI close button')
      element.click()
    })
  await expect(aiDialog(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'AI 写 SQL', exact: true }).evaluate((element) => {
    if (!(element instanceof HTMLButtonElement)) throw new Error('Expected AI open button')
    element.click()
  })
  await prompt(page).fill('重新打开后的新候选')
  await aiDialog(page).getByRole('button', { name: '生成 SQL', exact: true }).click()
  await expect.poll(() => state.ai.length).toBe(3)
  await leave.getByRole('button', { name: '放弃修改并继续', exact: true }).evaluate((element) => {
    if (!(element instanceof HTMLButtonElement)) throw new Error('Expected leave confirm button')
    element.click()
  })
  await expect(leave).toHaveCount(0)
  await expect(tabs(page)).toHaveCount(7)
  await expect.poll(() => editorValue(page)).toBe(originalSql)
  await expect(prompt(page)).toBeDisabled()
  await expect(proposal(page)).toHaveCount(0)
  reopened.release()
  await expectProposal(page)
  expect(state.executions).toBe(2)
  expect(state.errors).toEqual([])
})

test('tenant ABA discards an old AI error and its finally cannot unlock a newer generation', async ({
  page
}, info) => {
  const old = deferred()
  const current = deferred()
  const { state } = await prepare(page, info.project.name, {
    ai: [
      { wait: old.wait, status: 503, body: { message: '旧范围AI错误不应出现' } },
      { wait: current.wait, body: ai() }
    ]
  })
  await openAi(page, '旧范围请求')
  await expect.poll(() => state.ai.length).toBe(1)
  await changeScope(page, [tenantB, tenantA])
  await expect(aiDialog(page)).toHaveCount(0)
  await openAi(page, '当前范围请求')
  await expect.poll(() => state.ai.length).toBe(2)
  old.release()
  await expect.poll(() => state.aiReplies).toBe(1)
  await expect(prompt(page)).toBeDisabled()
  await expect(aiDialog(page).getByRole('button', { name: '生成 SQL', exact: true })).toBeDisabled()
  await expect(proposal(page)).toHaveCount(0)
  await expect(page.getByText('旧范围AI错误不应出现', { exact: true })).toHaveCount(0)
  current.release()
  await expectProposal(page)
  await expect(prompt(page)).toBeEnabled()
  await expect.poll(() => editorValue(page)).toBe(originalSql)
  expect(state.executions).toBe(0)
  expect(state.errors).toEqual([])
})

test('closing and reopening AI rejects late success; mode changes clear proposals and fix remains a preview at 390px', async ({
  page
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const old = deferred()
  const current = deferred()
  const fixedSql = "SELECT '修复候选' AS label;"
  const { state } = await prepare(page, info.project.name, {
    ai: [
      { wait: old.wait, body: ai("SELECT 'stale-ai' AS label;") },
      { wait: current.wait, body: ai() },
      { body: ai(fixedSql) }
    ]
  })
  await openAi(page, '关闭前请求')
  await expect.poll(() => state.ai.length).toBe(1)
  await closeAi(page)
  await openAi(page, '重新打开后请求')
  await expect.poll(() => state.ai.length).toBe(2)
  old.release()
  await expect.poll(() => state.aiReplies).toBe(1)
  await expect(proposal(page)).toHaveCount(0)
  await expect(prompt(page)).toBeDisabled()
  current.release()
  await expectProposal(page)
  await aiDialog(page).getByText('修复 SQL', { exact: true }).click()
  await expect(aiDialog(page).getByRole('radio', { name: '修复 SQL', exact: true })).toBeChecked()
  await expect(proposal(page)).toHaveCount(0)
  await aiDialog(page).getByRole('button', { name: '修复 SQL', exact: true }).click()
  await expectProposal(page, fixedSql)
  expect(state.ai[2]).toMatchObject({ mode: 'fix', currentSql: originalSql })
  await expect.poll(() => editorValue(page)).toBe(originalSql)
  for (const name of ['在新页签打开', '载入当前页签']) {
    const action = proposal(page).getByRole('button', { name, exact: true })
    await action.scrollIntoViewIfNeeded()
    await expect(action).toBeInViewport({
      ratio: 1
    })
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({ path: info.outputPath('ai-preview-fix-390.png'), animations: 'disabled' })
  await closeAi(page)
  await page.getByRole('button', { name: 'AI 写 SQL', exact: true }).click()
  await expect(proposal(page)).toHaveCount(0)
  expect(state.executions).toBe(0)
  expect(state.errors).toEqual([])
})
