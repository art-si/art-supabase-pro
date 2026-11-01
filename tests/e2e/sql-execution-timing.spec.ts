import { expect, test, type Page, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const actor = '00000000-0000-4000-8000-000000000053'
const tenantA = '00000000-0000-4000-8000-000000000051'
const tenantB = '00000000-0000-4000-8000-000000000052'
const fixture = `/tests/e2e/fixtures/sql-console-metadata.html?actor=${actor}&tenant=${tenantA}`
const workspaceKey = `sql-console:ckbftoopuyophiebamwy:${actor}:${tenantA}`
const endpoint = '**/functions/v1/execute-sql-with-columns'
const metadata = { schemas: ['public'], tables: [], columns: [], functions: [], foreignKeys: [] }

interface RequestBody {
  action?: string
  query?: string
  requestId?: string
  timeoutMs?: number
}
interface Reply {
  status?: number
  body: Record<string, unknown>
  wait?: Promise<void>
}

function deferred() {
  let release!: () => void
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  return { wait, release }
}

const success = (label: string, duration = true): Record<string, unknown> => ({
  status: 'ok',
  rows: [{ value: label }],
  columns: [{ name: 'value', type: 'text' }],
  command_tag: 'SELECT',
  row_count: 1,
  ...(duration ? { duration_ms: 4.5 } : {})
})

const runButton = (page: Page) => page.getByRole('button', { name: '执行 SQL', exact: true })
const cancelButton = (page: Page) => page.getByRole('button', { name: '取消查询', exact: true })
const waitLabel = (page: Page) => page.locator('.sql-execution-wait')
const browserDuration = (page: Page) => page.getByText(/^浏览器总等待 [\d.]+ (?:ms|s)$/)
const serverDuration = (page: Page) => page.getByText(/^执行端 [\d.]+ (?:ms|s)$/)

async function prepare(page: Page, project: string, replies: Reply[], cancelReplies: Reply[] = []) {
  page.setDefaultTimeout(15_000)
  page.setDefaultNavigationTimeout(60_000)
  await prepareIsolatedSession(page)
  const appearance = {
    theme: project.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !project.includes('shadow')
  } as const
  await prepareAppearance(page, appearance)
  await page.addInitScript(
    ({ tenantA, workspaceKey, appearance }) => {
      sessionStorage.setItem('art-platform-tenant-scope-active', '1')
      sessionStorage.setItem('art-platform-tenant-scope-id', tenantA)
      localStorage.setItem(workspaceKey, JSON.stringify({ draft: 'SELECT 1;', timeoutMs: 10000 }))
      const apply = () => {
        document.documentElement.dataset.boxMode = appearance.boxBorderMode
          ? 'border-mode'
          : 'shadow-mode'
        document.documentElement.dataset.uiScope = 'workspace'
      }
      if (document.documentElement) apply()
      else document.addEventListener('DOMContentLoaded', apply, { once: true })
    },
    { tenantA, workspaceKey, appearance }
  )
  const state = {
    requests: [] as RequestBody[],
    cancellations: [] as RequestBody[],
    replies: 0,
    cancelReplies: 0,
    errors: [] as string[]
  }
  page.on('pageerror', (error) => state.errors.push(error.message))
  async function fulfill(route: Route, reply: Reply) {
    await reply.wait
    await route.fulfill({ status: reply.status ?? 200, json: reply.body })
  }
  await page.route(endpoint, async (route) => {
    const body = route.request().postDataJSON() as RequestBody
    if (body.action === 'metadata') return route.fulfill({ json: metadata })
    if (body.action === 'cancel') {
      state.cancellations.push(body)
      const reply = cancelReplies[state.cancellations.length - 1]
      if (!reply) throw new Error('Unexpected cancellation in SQL timing fixture')
      await fulfill(route, reply)
      state.cancelReplies++
      return
    }
    state.requests.push(body)
    const reply = replies[state.requests.length - 1]
    if (!reply) throw new Error('Unexpected execution in SQL timing fixture')
    await fulfill(route, reply)
    state.replies++
  })
  await page.goto(fixture)
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await assertAppearance(page, appearance)
  // Only the browser's monotonic clock and UI timers advance. Network replies
  // remain controlled by independent gates in Node, including cancellation acks.
  await page.clock.install()
  return state
}

async function expectWaiting(page: Page, minimumSeconds: number, timeoutSeconds = 10) {
  await expect(page.locator('.execution-info')).toContainText(
    new RegExp(`本次时限 ${timeoutSeconds}(?:\\.0+)? s`)
  )
  await expect
    .poll(async () => Number((await waitLabel(page).textContent())?.match(/已等待 (\d+) 秒/)?.[1]))
    .toBeGreaterThanOrEqual(minimumSeconds)
  expect(
    await waitLabel(page).evaluate((element) => Boolean(element.closest('[aria-live="polite"]')))
  ).toBe(false)
}

async function expectFrozenTotal(page: Page, minimumSeconds: number) {
  await expect(browserDuration(page)).toBeVisible()
  const terminalText = await browserDuration(page).innerText()
  const match = terminalText.match(/([\d.]+) (ms|s)$/)
  expect(match).not.toBeNull()
  const seconds = Number(match?.[1]) / (match?.[2] === 'ms' ? 1000 : 1)
  expect(seconds).toBeGreaterThanOrEqual(minimumSeconds)
  await page.clock.fastForward(3500)
  await expect(browserDuration(page)).toHaveText(terminalText)
  await expect(waitLabel(page)).toHaveCount(0)
}

async function changeScope(page: Page, scopes: string[]) {
  await page.evaluate((scopes) => {
    for (const tenant of scopes)
      window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenant }))
  }, scopes)
}

test('delayed success, error and missing server duration retain distinct, frozen timing', async ({
  page
}, info) => {
  const gates = [deferred(), deferred(), deferred()]
  const state = await prepare(page, info.project.name, [
    { wait: gates[0].wait, body: success('timed-success') },
    {
      wait: gates[1].wait,
      status: 400,
      body: {
        status: 'error',
        errorCode: '42601',
        message: '查询语法有误，请检查后重试',
        duration_ms: 4.5
      }
    },
    { wait: gates[2].wait, body: success('no-server-duration', false) }
  ])
  for (let index = 0; index < gates.length; index++) {
    await runButton(page).click()
    await expect.poll(() => state.requests.length).toBe(index + 1)
    await expect(waitLabel(page)).toContainText('已等待 0 秒')
    await expect(browserDuration(page)).toHaveCount(0)
    await page.clock.fastForward(2100)
    await expectWaiting(page, 2)
    const live = page.locator('.execution-info [aria-live="polite"]')
    await expect(live).toContainText('执行中')
    await expect(live).not.toContainText('已等待')
    gates[index].release()
    await expect(runButton(page)).toBeEnabled()
    if (index === 1)
      await expect(page.locator('.error-panel')).toContainText('查询语法有误，请检查后重试')
    else
      await expect(page.locator('.result-table')).toContainText(
        index === 0 ? 'timed-success' : 'no-server-duration'
      )
    if (index === 2) await expect(serverDuration(page)).toHaveCount(0)
    else await expect(serverDuration(page)).toHaveText('执行端 5 ms')
    const title = await browserDuration(page).getAttribute('title')
    expect(title).toMatch(/认证|身份验证/)
    expect(title).toMatch(/网络|传输/)
    expect(title).toMatch(/客户端|浏览器/)
    await expectFrozenTotal(page, 2)
  }
  expect(state.requests.map((request) => request.timeoutMs)).toEqual([10000, 10000, 10000])
  expect(state.errors).toEqual([])
  await page.screenshot({ path: info.outputPath('terminal-no-server-duration.png') })
})

for (const retry of [false, true]) {
  test(`cancel acknowledgement preserves timing until termination${retry ? ' after retry' : ''}`, async ({
    page
  }, info) => {
    const gate = deferred()
    const state = await prepare(
      page,
      info.project.name,
      [
        {
          wait: gate.wait,
          status: 409,
          body: {
            status: 'error',
            errorCode: 'SQL_QUERY_CANCELLED',
            message: '查询已取消',
            duration_ms: 4.5
          }
        }
      ],
      [
        ...(retry
          ? [{ status: 503, body: { message: '取消查询失败，请重试或等待查询结束' } }]
          : []),
        { body: { status: 'ok', state: 'cancel_requested' } }
      ]
    )
    await runButton(page).click()
    await expect.poll(() => state.requests.length).toBe(1)
    await page.clock.fastForward(1100)
    await cancelButton(page).click()
    if (retry) {
      await expect(
        page.getByText('取消查询失败，请重试或等待查询结束', { exact: true })
      ).toBeVisible()
      await expect(cancelButton(page)).toBeEnabled()
      await page.clock.fastForward(1100)
      await expectWaiting(page, 2)
      await cancelButton(page).click()
    }
    await expect(cancelButton(page)).toBeDisabled()
    await expect(page.locator('.execution-info [aria-live="polite"]')).toContainText(
      '等待数据库结束'
    )
    await page.clock.fastForward(2100)
    await expectWaiting(page, retry ? 4 : 3)
    await expect(browserDuration(page)).toHaveCount(0)
    await expect(runButton(page)).toHaveCount(0)
    expect(
      state.cancellations.every((request) => request.requestId === state.requests[0].requestId)
    ).toBe(true)
    gate.release()
    await expect(runButton(page)).toBeEnabled()
    await expect(page.getByText('查询已取消', { exact: true })).toBeVisible()
    await expectFrozenTotal(page, retry ? 4 : 3)
    expect(state.errors).toEqual([])
  })
}

test('timeout changes affect the next query while the active timing keeps its request snapshot', async ({
  page
}, info) => {
  const first = deferred()
  const next = deferred()
  const state = await prepare(page, info.project.name, [
    { wait: first.wait, body: success('original-timeout') },
    { wait: next.wait, body: success('new-timeout') }
  ])
  await runButton(page).click()
  await expect.poll(() => state.requests.length).toBe(1)
  await page.getByRole('button', { name: '查询设置', exact: true }).click()
  await page.getByRole('combobox', { name: '查询超时', exact: true }).press('ArrowDown')
  await page.getByRole('option', { name: '30 秒', exact: true }).click()
  await page.getByRole('button', { name: '查询设置', exact: true }).click()
  await page.clock.fastForward(2100)
  await expectWaiting(page, 2, 10)
  first.release()
  await expect(runButton(page)).toBeEnabled()
  await runButton(page).click()
  await expect.poll(() => state.requests.length).toBe(2)
  await expect(waitLabel(page)).toContainText('已等待 0 秒')
  await expectWaiting(page, 0, 30)
  expect(state.requests.map((request) => request.timeoutMs)).toEqual([10000, 30000])
  next.release()
  await expect(runButton(page)).toBeEnabled()
  expect(state.errors).toEqual([])
})

for (const outcome of ['success', 'error'] as const) {
  test(`same-turn scope ABA rejects stale ${outcome} and its finally cannot stop a new timer`, async ({
    page
  }, info) => {
    const old = deferred()
    const current = deferred()
    const state = await prepare(page, info.project.name, [
      {
        wait: old.wait,
        status: outcome === 'error' ? 400 : 200,
        body:
          outcome === 'error'
            ? { status: 'error', message: '旧范围错误不应出现', duration_ms: 9876 }
            : success('stale-result')
      },
      { wait: current.wait, body: success('current-owner-result') }
    ])
    await runButton(page).click()
    await expect.poll(() => state.requests.length).toBe(1)
    await page.clock.fastForward(3100)
    await expectWaiting(page, 3)
    await changeScope(page, [tenantB, tenantA])
    await expect(runButton(page)).toBeEnabled()
    await expect(waitLabel(page)).toHaveCount(0)
    await expect(browserDuration(page)).toHaveCount(0)
    await runButton(page).click()
    await expect.poll(() => state.requests.length).toBe(2)
    await expect(waitLabel(page)).toContainText('已等待 0 秒')
    old.release()
    await expect.poll(() => state.replies).toBe(1)
    await page.clock.fastForward(2100)
    await expectWaiting(page, 2)
    await expect(cancelButton(page)).toBeEnabled()
    await expect(page.locator('.result-table')).toHaveCount(0)
    await expect(page.locator('.error-panel')).toHaveCount(0)
    await expect(browserDuration(page)).toHaveCount(0)
    current.release()
    await expect(runButton(page)).toBeEnabled()
    await expect(page.locator('.result-table')).toContainText('current-owner-result')
    await expectFrozenTotal(page, 2)
    await expect(page.getByText('旧范围错误不应出现', { exact: true })).toHaveCount(0)
    expect(state.errors).toEqual([])
  })
}

test('late cancel ack and old response cannot change a different tenant query or revive cleared timing', async ({
  page
}, info) => {
  const old = deferred()
  const ack = deferred()
  const current = deferred()
  const state = await prepare(
    page,
    info.project.name,
    [
      { wait: old.wait, body: success('stale-cancel-result') },
      { wait: current.wait, body: success('tenant-b-result') }
    ],
    [{ wait: ack.wait, body: { status: 'ok', state: 'cancel_requested' } }]
  )
  await runButton(page).click()
  await expect.poll(() => state.requests.length).toBe(1)
  await cancelButton(page).click()
  await expect.poll(() => state.cancellations.length).toBe(1)
  await changeScope(page, [tenantB])
  await expect(runButton(page)).toBeEnabled()
  await expect(waitLabel(page)).toHaveCount(0)
  await runButton(page).click()
  await expect.poll(() => state.requests.length).toBe(2)
  ack.release()
  await expect.poll(() => state.cancelReplies).toBe(1)
  await expect(cancelButton(page)).toBeEnabled()
  await expect(page.locator('.execution-info [aria-live="polite"]')).toContainText('执行中')
  old.release()
  await expect.poll(() => state.replies).toBe(1)
  await page.clock.fastForward(2100)
  await expectWaiting(page, 2)
  current.release()
  await expect(page.locator('.result-table')).toContainText('tenant-b-result')
  await changeScope(page, [tenantA])
  await expect(waitLabel(page)).toHaveCount(0)
  await expect(browserDuration(page)).toHaveCount(0)
  await page.clock.fastForward(4000)
  await expect(waitLabel(page)).toHaveCount(0)
  await expect(browserDuration(page)).toHaveCount(0)
  expect(state.errors).toEqual([])
})

test('tab changes invalidate timing and late replies leave the current tab usable', async ({
  page
}, info) => {
  const old = deferred()
  const current = deferred()
  const state = await prepare(page, info.project.name, [
    { wait: old.wait, body: success('old-tab-result') },
    { wait: current.wait, body: success('new-tab-result') }
  ])
  await runButton(page).click()
  await expect.poll(() => state.requests.length).toBe(1)
  await page.clock.fastForward(2100)
  await page.getByRole('button', { name: '新建查询页签', exact: true }).click()
  await expect(
    page.getByRole('tablist', { name: 'SQL 查询页签', exact: true }).getByRole('tab')
  ).toHaveCount(2)
  await expect(waitLabel(page)).toHaveCount(0)
  await expect(runButton(page)).toBeEnabled()
  await runButton(page).click()
  await expect.poll(() => state.requests.length).toBe(2)
  old.release()
  await expect.poll(() => state.replies).toBe(1)
  await page.clock.fastForward(2100)
  await expectWaiting(page, 2)
  current.release()
  await expect(page.locator('.result-table')).toContainText('new-tab-result')
  await expectFrozenTotal(page, 2)
  expect(state.errors).toEqual([])
})

test('a schema update from another window invalidates pending execution and its timing', async ({
  page
}, info) => {
  const old = deferred()
  const current = deferred()
  const state = await prepare(page, info.project.name, [
    { wait: old.wait, body: success('old-schema-result') },
    { wait: current.wait, body: success('current-schema-result') }
  ])
  await runButton(page).click()
  await expect.poll(() => state.requests.length).toBe(1)
  await page.clock.fastForward(2100)
  // A separate same-origin Window produces the real storage event used by
  // useStorage, as when another SQL workspace window updates its saved schema.
  await page.evaluate((key) => {
    const peer = window.open('about:blank', '_blank')
    if (!peer) throw new Error('Could not open the same-origin storage peer')
    const workspace: Record<string, unknown> = JSON.parse(peer.localStorage.getItem(key) || '{}')
    peer.localStorage.setItem(key, JSON.stringify({ ...workspace, querySchema: 'archive' }))
    peer.close()
  }, workspaceKey)
  await expect(runButton(page)).toBeEnabled()
  await expect(waitLabel(page)).toHaveCount(0)
  await runButton(page).click()
  await expect.poll(() => state.requests.length).toBe(2)
  old.release()
  await expect.poll(() => state.replies).toBe(1)
  await page.clock.fastForward(2100)
  await expectWaiting(page, 2)
  current.release()
  await expect(page.locator('.result-table')).toContainText('current-schema-result')
  await expectFrozenTotal(page, 2)
  expect(state.errors).toEqual([])
})

test('refreshing connection configuration invalidates the old execution without stopping its successor', async ({
  page
}, info) => {
  const gateway = 'http://127.0.0.1:4319'
  const connectionId = '00000000-0000-4000-8000-000000000054'
  const old = deferred()
  const current = deferred()
  const connection = {
    id: connectionId,
    name: '计时隔离库',
    dialect: 'postgres',
    host: 'localhost',
    port: 5432,
    database: 'timing',
    username: 'reader',
    tls: false,
    enabled: true,
    tenantId: tenantA,
    allowedUserIds: [],
    updatedAt: '2026-10-31T00:00:00Z'
  }
  await page.addInitScript(
    ({ actor, tenantA, connectionId }) => {
      localStorage.setItem(
        `sql-query-tabs:${actor}:${tenantA}`,
        JSON.stringify({
          active: 'external-main',
          tabs: [{ id: 'external-main', connectionId, label: '计时隔离库' }]
        })
      )
    },
    { actor, tenantA, connectionId }
  )
  let queries = 0
  let replies = 0
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
        json: { connections: [connection], users: [], canManage: true }
      })
    if (path.endsWith('/metadata')) return route.fulfill({ headers, json: metadata })
    if (!path.endsWith('/query')) throw new Error(`Unexpected timing gateway path: ${path}`)
    const index = queries++
    await (index === 0 ? old.wait : current.wait)
    // External gateways use the normalized camel-case response contract.
    await route.fulfill({
      headers,
      json: {
        status: 'ok',
        rows: [{ value: index === 0 ? 'old-config-result' : 'current-config-result' }],
        columns: [{ name: 'value', type: 'text' }],
        commandTag: 'SELECT',
        rowCount: 1,
        durationMs: 4.5,
        truncated: false,
        maxRows: 200,
        timeoutMs: 10000
      }
    })
    replies++
  })
  const state = await prepare(page, info.project.name, [])
  await expect(page.locator('.sql-target-context')).toContainText('计时隔离库')
  await runButton(page).click()
  await expect.poll(() => queries).toBe(1)
  await page.clock.fastForward(2100)
  await page.getByRole('button', { name: '连接管理', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '数据库连接', exact: true })
  await expect(manager).toBeVisible()
  connection.updatedAt = '2026-10-31T00:01:00Z'
  await manager.getByRole('button', { name: '刷新连接', exact: true }).click()
  await expect(manager.getByRole('button', { name: '刷新连接', exact: true })).toBeEnabled()
  await manager.getByRole('button', { name: '关闭', exact: true }).last().click()
  await expect(runButton(page)).toBeEnabled()
  await expect(waitLabel(page)).toHaveCount(0)
  await runButton(page).click()
  await expect.poll(() => queries).toBe(2)
  old.release()
  await expect.poll(() => replies).toBe(1)
  await page.clock.fastForward(2100)
  await expectWaiting(page, 2)
  current.release()
  await expect(page.locator('.result-table')).toContainText('current-config-result')
  await expectFrozenTotal(page, 2)
  expect(state.requests).toEqual([])
  expect(state.errors).toEqual([])
})

test('390px timing stays outside live announcements, wraps without overflow and keeps cancel reachable', async ({
  page
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const gate = deferred()
  const state = await prepare(page, info.project.name, [
    { wait: gate.wait, body: success('mobile-timing') }
  ])
  await runButton(page).click()
  await expect.poll(() => state.requests.length).toBe(1)
  await page.clock.fastForward(12_100)
  await expectWaiting(page, 12)
  const live = page.locator('.execution-info [aria-live="polite"]')
  await expect(live).toHaveText('执行中…')
  await page.clock.fastForward(2100)
  await expect(live).toHaveText('执行中…')
  await expect(cancelButton(page)).toBeInViewport({ ratio: 1 })
  await cancelButton(page).focus()
  await expect(cancelButton(page)).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  expect(
    await waitLabel(page).evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  ).toBe(true)
  await page.screenshot({ path: info.outputPath('waiting-390.png'), animations: 'disabled' })
  gate.release()
  await expect(runButton(page)).toBeEnabled()
  await expect(browserDuration(page)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({ path: info.outputPath('terminal-390.png'), animations: 'disabled' })
  expect(state.errors).toEqual([])
})
