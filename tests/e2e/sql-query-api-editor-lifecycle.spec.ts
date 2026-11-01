import { expect, test, type Locator, type Page, type Request } from '@playwright/test'
import type { SqlQueryApiDefinition, SqlQueryApiInput } from '../../src/types/sql-query-api'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const actor = '00000000-0000-4000-8000-000000000091'
const tenantA = '00000000-0000-4000-8000-000000000092'
const tenantB = '00000000-0000-4000-8000-000000000093'
const first: SqlQueryApiDefinition = {
  id: '00000000-0000-4000-8000-000000000094',
  slug: 'editor-lifecycle-first',
  name: '编辑会话 API',
  description: '仅使用隔离数据验证编辑保存的生命周期',
  sql: 'SELECT :amount::numeric AS amount',
  tenantId: tenantA,
  allowedUserIds: [actor],
  parameters: [{ name: 'amount', type: 'number', required: true }],
  maxRows: 200,
  timeoutMs: 10000,
  enabled: true,
  updatedAt: '2026-11-01T00:00:00Z'
}
const second: SqlQueryApiDefinition = {
  ...first,
  id: '00000000-0000-4000-8000-000000000095',
  slug: 'editor-lifecycle-second',
  name: '新调用会话 API'
}
const preciseAmount = '12345678901234567890.1234567890123456789'
const lateError = '旧会话保存失败，请重试'
const currentError = '本次保存失败，请重试'
const requestIdPattern = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i

interface Reply {
  body: object
  status?: number
}
interface SaveNotice {
  kind: 'success' | 'warning'
  text: string
}
declare global {
  interface Window {
    __sqlApiEditorNotices: SaveNotice[]
  }
}

function gate<T>() {
  let release!: (value: T) => void
  const wait = new Promise<T>((resolve) => {
    release = resolve
  })
  return { wait, release }
}
interface PendingCall {
  request: Request
  body: Record<string, unknown>
  reply: ReturnType<typeof gate<Reply>>
  delivered: boolean
}
interface State {
  definitions: SqlQueryApiDefinition[]
  saves: PendingCall[]
  invokes: PendingCall[]
  unexpected: unknown[]
}

const errorsByPage = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const errors: string[] = []
  errorsByPage.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(({ page }) => {
  expect(errorsByPage.get(page) ?? [], 'Unhandled page runtime errors').toEqual([])
})

const manager = (page: Page) => page.getByRole('dialog', { name: '查询 API', exact: true })
const editor = (page: Page) => page.getByRole('dialog', { name: '编辑查询 API', exact: true })
const saveButton = (page: Page) =>
  editor(page).getByRole('button', { name: '保存 API', exact: true })
const apiButton = (drawer: Locator, name: string) =>
  drawer
    .getByRole('navigation', { name: '查询 API 列表', exact: true })
    .getByRole('button', { name: new RegExp(name) })
const parameter = (drawer: Locator) =>
  drawer.getByRole('textbox', { name: 'API 参数 amount', exact: true })
const result = (drawer: Locator) => drawer.locator('.result-table-container')
const notices = (page: Page) => page.evaluate(() => [...window.__sqlApiEditorNotices])
const saveInput = (definition: SqlQueryApiDefinition, name: string): SqlQueryApiInput => ({
  ...definition,
  name,
  description: '核对过的保存用途',
  sql: 'SELECT :amount::numeric AS amount'
})
const savedReply = (input: SqlQueryApiInput): Reply => ({
  body: { ...input, updatedAt: '2026-11-01T01:00:00Z' }
})
const invokeReply = (label: string): Reply => ({
  body: {
    status: 'ok',
    rows: [{ label, amount: preciseAmount }],
    columns: [{ name: 'label' }, { name: 'amount' }],
    rowCount: 1,
    durationMs: 4,
    truncated: false,
    maxRows: 200,
    timeoutMs: 10000
  }
})
const failure = (message: string): Reply => ({ status: 503, body: { status: 'error', message } })
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

async function prepare(page: Page, project: string, ordinary = false) {
  page.setDefaultTimeout(15_000)
  page.setDefaultNavigationTimeout(60_000)
  await prepareIsolatedSession(page)
  const appearance = {
    theme: project.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !project.includes('shadow')
  } as const
  await prepareAppearance(page, appearance)
  await page.addInitScript(
    ({ appearance, messages }) => {
      window.__sqlApiEditorNotices = []
      const apply = () => {
        document.documentElement.dataset.boxMode = appearance.boxBorderMode
          ? 'border-mode'
          : 'shadow-mode'
        document.documentElement.dataset.uiScope = 'admin'
      }
      if (document.documentElement) apply()
      else document.addEventListener('DOMContentLoaded', apply, { once: true })
      // Retain every relevant notice even after its ordinary toast expiry. A late
      // save response must not pass merely because a transient warning disappeared.
      const seen = new WeakSet<Element>()
      new MutationObserver(() => {
        for (const element of document.querySelectorAll('.el-message')) {
          if (seen.has(element)) continue
          const text = element.textContent?.trim() || ''
          if (!messages.some((message) => text.includes(message))) continue
          seen.add(element)
          window.__sqlApiEditorNotices.push({
            kind: element.classList.contains('el-message--success') ? 'success' : 'warning',
            text
          })
        }
      }).observe(document, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class']
      })
    },
    { appearance, messages: ['查询 API 已保存', lateError, currentError] }
  )
  const state: State = {
    definitions: structuredClone([first, second]),
    saves: [],
    invokes: [],
    unexpected: []
  }
  await page.route('**/functions/v1/execute-sql-with-columns', (route) =>
    route.fulfill({
      json: { schemas: [], tables: [], columns: [], functions: [], foreignKeys: [] }
    })
  )
  await page.route('**/rest/v1/sys_tenant?*', (route) =>
    route.fulfill({
      json: [{ id: tenantA, tenant_name: '隔离测试租户', tenant_code: 'editor-test', status: '1' }]
    })
  )
  await page.route('**/functions/v1/sql-query-api**', async (route) => {
    const request = route.request()
    const body: unknown = request.postDataJSON()
    if (isRecord(body) && body.action === 'list')
      return route.fulfill({
        json: {
          definitions: state.definitions,
          canManage: !ordinary,
          users: ordinary ? [] : [{ id: actor, name: '授权测试账号', tenantId: tenantA }]
        }
      })
    const save = isRecord(body) && body.action === 'save' && isRecord(body.input)
    const invoke = isRecord(body) && isRecord(body.params) && !('action' in body)
    if (isRecord(body) && (save || invoke)) {
      const call: PendingCall = { request, body, reply: gate<Reply>(), delivered: false }
      ;(save ? state.saves : state.invokes).push(call)
      const response = await call.reply.wait
      await route.fulfill({ status: response.status ?? 200, json: response.body })
      call.delivered = true
      return
    }
    state.unexpected.push(body)
    return route.fulfill({ status: 400, json: { message: '测试不应发送其他查询 API 操作' } })
  })
  await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=${actor}&tenant=${tenantA}&keepalive=1${ordinary ? '&ordinary=1' : ''}`
  )
  await assertAppearance(page, appearance)
  await openManager(page)
  await expect(apiButton(manager(page), first.name)).toHaveAttribute('aria-pressed', 'true')
  return state
}

async function openManager(page: Page) {
  await page.getByRole('button', { name: '查询 API', exact: true }).click()
  await expect(manager(page)).toBeVisible()
  await expect(manager(page).getByRole('button', { name: '调用 API', exact: true })).toBeEnabled()
}

async function beginSave(
  page: Page,
  state: State,
  definition: SqlQueryApiDefinition,
  name: string
) {
  await manager(page).getByRole('button', { name: '编辑与授权', exact: true }).click()
  await expect(editor(page)).toBeVisible()
  await expect(
    editor(page).getByRole('textbox', { name: '查询 API 地址标识', exact: true })
  ).toBeDisabled()
  await editor(page)
    .getByRole('textbox', { name: '查询 API 名称', exact: true })
    .fill(`  ${name}  `)
  await editor(page)
    .getByRole('textbox', { name: '查询 API 用途说明', exact: true })
    .fill('  核对过的保存用途  ')
  await editor(page)
    .getByRole('textbox', { name: '查询 API SQL', exact: true })
    .fill(' \nSELECT :amount::numeric AS amount\n ')
  const count = state.saves.length
  await saveButton(page).click()
  await expect.poll(() => state.saves.length).toBe(count + 1)
  const call = state.saves[count]
  expect(call.body).toEqual({ action: 'save', input: saveInput(definition, name) })
  await expect(saveButton(page)).toBeDisabled()
  return call
}

async function leaveAndReturn(page: Page) {
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('sql-preview-active', { detail: false }))
  )
  await expect(manager(page)).toBeHidden()
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('sql-preview-active', { detail: true }))
  )
  // Reopen through the public toolbar. Do not reopen or manually close the old
  // editor: either action would mask the missing editor-session invalidation.
  await openManager(page)
  await expect(editor(page)).toBeHidden()
}

async function invokeSecond(page: Page, state: State) {
  const drawer = manager(page)
  await apiButton(drawer, second.name).click()
  await expect(apiButton(drawer, second.name)).toHaveAttribute('aria-pressed', 'true')
  await parameter(drawer).fill(preciseAmount)
  const count = state.invokes.length
  await drawer.getByRole('button', { name: '调用 API', exact: true }).click()
  await expect.poll(() => state.invokes.length).toBe(count + 1)
  const call = state.invokes[count]
  expect(new URL(call.request.url()).pathname).toBe(`/functions/v1/sql-query-api/${second.slug}`)
  expect(call.body).toEqual({
    params: { amount: preciseAmount },
    requestId: expect.stringMatching(requestIdPattern)
  })
  return call
}

async function deliver(page: Page, call: PendingCall, response: Reply) {
  const received = page.waitForResponse((candidate) => candidate.request() === call.request)
  call.reply.release(response)
  await (await received).finished()
  await expect.poll(() => call.delivered).toBe(true)
  // Observe the fulfilled response and the subsequent rendered frame, rather
  // than guessing a timeout or relying on a negative assertion's first poll.
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
}

async function expectCurrentResult(page: Page, label: string) {
  const drawer = manager(page)
  await expect(apiButton(drawer, second.name)).toHaveAttribute('aria-pressed', 'true')
  await expect(drawer.getByRole('heading', { name: second.name, exact: true })).toBeVisible()
  await expect(parameter(drawer)).toHaveValue(preciseAmount)
  await expect(result(drawer)).toContainText(label)
  await expect(drawer.getByLabel('API 调用状态', { exact: true })).toContainText('调用完成')
}

test('KeepAlive late editor success cannot replace the new API selection or erase its result', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name)
  const oldName = '离开前的旧保存'
  const oldSave = await beginSave(page, state, first, oldName)
  await page.screenshot({ path: info.outputPath('api-editor-pending.png'), animations: 'disabled' })
  await leaveAndReturn(page)
  const newInvoke = await invokeSecond(page, state)
  await deliver(page, newInvoke, invokeReply('新会话已完成的结果'))
  await expectCurrentResult(page, '新会话已完成的结果')
  await deliver(page, oldSave, savedReply(saveInput(first, oldName)))
  expect(await notices(page), 'The detached editor must not announce a stale save').toEqual([])
  await expectCurrentResult(page, '新会话已完成的结果')
  await expect(manager(page)).not.toContainText(oldName)
  await expect(editor(page)).toBeHidden()
  expect(state.saves).toHaveLength(1)
  expect(state.invokes).toHaveLength(1)

  const name = '本次会话正常保存'
  const currentSave = await beginSave(page, state, second, name)
  await deliver(page, currentSave, savedReply(saveInput(second, name)))
  await expect(editor(page)).toBeHidden()
  await expect(manager(page).getByRole('heading', { name, exact: true })).toBeVisible()
  await expect.poll(() => notices(page)).toEqual([{ kind: 'success', text: '查询 API 已保存' }])
  expect(state.saves).toHaveLength(2)
  expect(state.invokes).toHaveLength(1)
  expect(state.unexpected).toEqual([])
  await page.screenshot({
    path: info.outputPath('api-editor-current-save.png'),
    animations: 'disabled'
  })
})

test('KeepAlive late editor error is silent while the new call and current save retry remain usable', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name)
  const oldSave = await beginSave(page, state, first, '离开前会失败的保存')
  await leaveAndReturn(page)
  const newInvoke = await invokeSecond(page, state)
  await deliver(page, oldSave, failure(lateError))
  expect(await notices(page), 'The detached editor must not report its late failure').toEqual([])
  await expect(apiButton(manager(page), second.name)).toHaveAttribute('aria-pressed', 'true')
  await expect(manager(page).getByRole('button', { name: '取消调用', exact: true })).toBeEnabled()
  await expect(manager(page).getByLabel('API 调用状态', { exact: true })).toContainText('正在调用')
  await expect(parameter(manager(page))).toHaveValue(preciseAmount)
  await deliver(page, newInvoke, invokeReply('旧保存失败后仍完成的新结果'))
  await expectCurrentResult(page, '旧保存失败后仍完成的新结果')
  await expect(editor(page)).toBeHidden()

  const name = '可重试的本次保存'
  const currentSave = await beginSave(page, state, second, name)
  await deliver(page, currentSave, failure(currentError))
  await expect(editor(page)).toBeVisible()
  await expect(
    editor(page).getByRole('textbox', { name: '查询 API 名称', exact: true })
  ).toHaveValue(`  ${name}  `)
  await expect(
    editor(page).getByRole('textbox', { name: '查询 API 用途说明', exact: true })
  ).toHaveValue('  核对过的保存用途  ')
  await expect(saveButton(page)).toBeEnabled()
  await expect.poll(() => notices(page)).toEqual([{ kind: 'warning', text: currentError }])
  await page.screenshot({
    path: info.outputPath('api-editor-current-retry.png'),
    animations: 'disabled'
  })
  await saveButton(page).click()
  await expect.poll(() => state.saves.length).toBe(3)
  expect(state.saves[2].body).toEqual(currentSave.body)
  await deliver(page, state.saves[2], savedReply(saveInput(second, name)))
  await expect(editor(page)).toBeHidden()
  await expect(manager(page).getByRole('heading', { name, exact: true })).toBeVisible()
  await expect
    .poll(() => notices(page))
    .toEqual([
      { kind: 'warning', text: currentError },
      { kind: 'success', text: '查询 API 已保存' }
    ])
  expect(state.saves).toHaveLength(3)
  expect(state.invokes).toHaveLength(1)
  expect(state.unexpected).toEqual([])
})

test('same-tick tenant ABA invalidates a pending valid editor save before a fresh invocation', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name)
  const name = '租户切换前的旧保存'
  const oldSave = await beginSave(page, state, first, name)
  await page.evaluate(
    ({ tenantA, tenantB }) => {
      window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenantB }))
      window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenantA }))
    },
    { tenantA, tenantB }
  )
  await expect(manager(page)).toBeHidden()
  await expect(editor(page)).toBeHidden()
  await openManager(page)
  const current = await invokeSecond(page, state)
  await deliver(page, current, invokeReply('回到原租户后的当前结果'))
  await deliver(page, oldSave, savedReply(saveInput(first, name)))
  expect(await notices(page)).toEqual([])
  await expectCurrentResult(page, '回到原租户后的当前结果')
  await expect(manager(page)).not.toContainText(name)
  expect(state.saves).toHaveLength(1)
  expect(state.invokes).toHaveLength(1)
  expect(state.unexpected).toEqual([])
})

test('an authorized ordinary user retains the public call form without API editor actions', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name, true)
  await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toBeDisabled()
  await expect(manager(page).getByRole('button', { name: '编辑与授权', exact: true })).toHaveCount(
    0
  )
  await expect(
    manager(page).getByRole('button', { name: '新建查询 API', exact: true })
  ).toHaveCount(0)
  await leaveAndReturn(page)
  const current = await invokeSecond(page, state)
  await deliver(page, current, invokeReply('普通授权账号的调用结果'))
  await expectCurrentResult(page, '普通授权账号的调用结果')
  await expect(manager(page).getByRole('button', { name: '编辑与授权', exact: true })).toHaveCount(
    0
  )
  expect(state.saves).toEqual([])
  expect(state.invokes).toHaveLength(1)
  expect(state.unexpected).toEqual([])
  expect(await notices(page)).toEqual([])
  await page.setViewportSize({ width: 390, height: 844 })
  await result(manager(page)).scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({
    path: info.outputPath('api-editor-ordinary-narrow.png'),
    animations: 'disabled'
  })
})
