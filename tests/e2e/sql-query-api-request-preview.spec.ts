import { expect, test, type Locator, type Page, type Request } from '@playwright/test'
import type { SqlQueryApiDefinition } from '../../src/types/sql-query-api'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(150_000)

const actor = '00000000-0000-4000-8000-000000000101'
const tenantA = '00000000-0000-4000-8000-000000000102'
const tenantB = '00000000-0000-4000-8000-000000000103'
const precise = '9007199254740993.01234567890123456789'
const queryA = "  客户 O'Reilly A  "
const queryB = '当前表单 B 不得覆盖旧请求'
const privateResult = 'PRIVATE_RESULT_NOT_IN_REQUEST'
const definition: SqlQueryApiDefinition = {
  id: '00000000-0000-4000-8000-000000000104',
  slug: 'request-preview-example',
  name: '本次请求隔离示例',
  description: '使用隔离参数检查实际发送内容',
  sql: 'SELECT :amount::numeric AS PRIVATE_SQL_NOT_IN_REQUEST',
  tenantId: tenantA,
  allowedUserIds: [actor],
  parameters: [
    { name: 'amount', type: 'number', required: true },
    { name: 'enabled', type: 'boolean', required: true },
    { name: 'query', type: 'string', required: true },
    { name: 'optional_value', type: 'string', required: false },
    { name: 'constructor', type: 'string', required: false }
  ],
  maxRows: 200,
  timeoutMs: 10000,
  enabled: true,
  updatedAt: '2026-11-01T00:00:00Z'
}
const secondary: SqlQueryApiDefinition = {
  ...definition,
  id: '00000000-0000-4000-8000-000000000105',
  slug: 'request-preview-secondary',
  name: '另一个本次请求示例'
}
const normalizedA = {
  amount: precise,
  enabled: false,
  query: queryA,
  constructor: '构造参数 A'
}
const normalizedB = {
  amount: '2.50',
  enabled: true,
  query: queryB,
  optional_value: '本次表单可选值 B',
  constructor: '构造参数 B'
}
const requestIdPattern = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i

interface Reply {
  body: object
  status?: number
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
interface FixtureState {
  definitions: SqlQueryApiDefinition[]
  invokes: PendingCall[]
  cancels: Record<string, unknown>[]
  mutations: unknown[]
  rawQueries: unknown[]
  lists: number
}
interface NativeCopy {
  value: string
  resolve: () => void
  reject: (cause: unknown) => void
  settled: boolean
}
interface ClipboardState {
  calls: NativeCopy[]
  legacy: string[]
  notices: { kind: 'success' | 'error'; text: string }[]
}
declare global {
  interface Window {
    __sqlRequestPreviewClipboard: ClipboardState
  }
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
const viewer = (page: Page) => page.getByRole('dialog', { name: '本次请求', exact: true })
const previewButton = (page: Page) =>
  manager(page).getByRole('button', { name: '查看本次请求', exact: true })
const input = (page: Page, name: string) =>
  manager(page).getByRole('textbox', { name: `API 参数 ${name}`, exact: true })
const invokeButton = (page: Page) =>
  manager(page).getByRole('button', { name: '调用 API', exact: true })
const apiButton = (page: Page, name: string) =>
  manager(page)
    .getByRole('navigation', { name: '查询 API 列表', exact: true })
    .getByRole('button', { name: new RegExp(name) })
const previewSection = (page: Page, title: string) =>
  viewer(page)
    .locator('details.sql-plan-code')
    .filter({ has: page.getByText(title, { exact: true }) })
const previewCode = (page: Page, title: string) =>
  viewer(page).locator(`pre[aria-label="${title}代码"] code`)
const copyButton = (section: Locator, language: 'JSON' | 'PLAINTEXT') =>
  section.getByRole('button', { name: `复制 ${language}`, exact: true })
const success = (label = privateResult): Reply => ({
  body: {
    status: 'ok',
    rows: [{ label }],
    columns: [{ name: 'label' }],
    rowCount: 1,
    durationMs: 4,
    truncated: false,
    maxRows: 200,
    timeoutMs: 10000
  }
})
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

async function prepare(page: Page, project: string, ordinary = true) {
  page.setDefaultTimeout(15_000)
  page.setDefaultNavigationTimeout(60_000)
  await prepareIsolatedSession(page)
  const appearance = {
    theme: project.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !project.includes('shadow')
  } as const
  await prepareAppearance(page, appearance)
  await page.addInitScript((appearance) => {
    const state: ClipboardState = { calls: [], legacy: [], notices: [] }
    window.__sqlRequestPreviewClipboard = state
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (value: string) =>
          new Promise<void>((resolve, reject) => {
            state.calls.push({ value, resolve, reject, settled: false })
          })
      }
    })
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: (command: string) => {
        if (command !== 'copy') return false
        const active = document.activeElement
        state.legacy.push(active instanceof HTMLTextAreaElement ? active.value : '')
        return true
      }
    })
    const apply = () => {
      document.documentElement.dataset.boxMode = appearance.boxBorderMode
        ? 'border-mode'
        : 'shadow-mode'
      document.documentElement.dataset.uiScope = 'admin'
    }
    if (document.documentElement) apply()
    else document.addEventListener('DOMContentLoaded', apply, { once: true })
    const seen = new WeakSet<Element>()
    // Retain every copy notice after its normal expiry so stale acknowledgements
    // cannot pass a negative assertion by producing a short-lived toast.
    new MutationObserver(() => {
      for (const element of document.querySelectorAll('.el-message')) {
        if (seen.has(element)) continue
        const text = element.textContent?.trim() || ''
        const success = element.classList.contains('el-message--success') && text.includes('已复制')
        const failure = text.includes('复制失败')
        if (!success && !failure) continue
        seen.add(element)
        state.notices.push({ kind: success ? 'success' : 'error', text })
      }
    }).observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class']
    })
  }, appearance)
  const state: FixtureState = {
    definitions: structuredClone([definition, secondary]),
    invokes: [],
    cancels: [],
    mutations: [],
    rawQueries: [],
    lists: 0
  }
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    const body: unknown = route.request().postDataJSON()
    if (!isRecord(body) || body.action !== 'metadata') state.rawQueries.push(body)
    return route.fulfill({
      json: { schemas: [], tables: [], columns: [], functions: [], foreignKeys: [] }
    })
  })
  await page.route('**/functions/v1/sql-query-api**', async (route) => {
    const request = route.request()
    const body: unknown = request.postDataJSON()
    if (isRecord(body) && body.action === 'list') {
      state.lists++
      return route.fulfill({
        json: { definitions: state.definitions, canManage: !ordinary, users: [] }
      })
    }
    if (isRecord(body) && body.action === 'cancel') {
      state.cancels.push(body)
      return route.fulfill({ json: { status: 'ok', state: 'cancel_requested' } })
    }
    if (isRecord(body) && isRecord(body.params) && !('action' in body)) {
      const call: PendingCall = { request, body, reply: gate<Reply>(), delivered: false }
      state.invokes.push(call)
      const response = await call.reply.wait
      await route.fulfill({ status: response.status ?? 200, json: response.body })
      call.delivered = true
      return
    }
    state.mutations.push(body)
    return route.fulfill({ status: 400, json: { message: '查看请求不应修改查询 API' } })
  })
  await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=${actor}&tenant=${tenantA}&keepalive=1${ordinary ? '&ordinary=1' : ''}`
  )
  await assertAppearance(page, appearance)
  await openManager(page)
  await expect(apiButton(page, definition.name)).toHaveAttribute('aria-pressed', 'true')
  await expect(previewButton(page)).toBeDisabled()
  return state
}

async function openManager(page: Page) {
  await page.getByRole('button', { name: '查询 API', exact: true }).click()
  await expect(manager(page)).toBeVisible()
  await expect(invokeButton(page)).toBeEnabled()
}

async function fillParameters(page: Page, variant: 'A' | 'B' = 'A') {
  await input(page, 'amount').fill(variant === 'A' ? `  ${precise}  ` : normalizedB.amount)
  await manager(page).getByRole('combobox', { name: 'API 参数 enabled', exact: true }).click()
  await page.getByRole('option', { name: variant === 'A' ? 'false' : 'true', exact: true }).click()
  await input(page, 'query').fill(variant === 'A' ? queryA : queryB)
  await input(page, 'optional_value').fill(variant === 'A' ? '' : normalizedB.optional_value)
  await input(page, 'constructor').fill(
    variant === 'A' ? normalizedA.constructor : normalizedB.constructor
  )
}

async function dispatch(page: Page, state: FixtureState, variant: 'A' | 'B' = 'A') {
  await fillParameters(page, variant)
  const count = state.invokes.length
  await invokeButton(page).click()
  await expect.poll(() => state.invokes.length).toBe(count + 1)
  const call = state.invokes[count]
  expect(call.body).toEqual({
    params: variant === 'A' ? normalizedA : normalizedB,
    requestId: expect.stringMatching(requestIdPattern)
  })
  await expect(previewButton(page)).toBeEnabled()
  return call
}

async function deliver(page: Page, call: PendingCall, reply: Reply) {
  const received = page.waitForResponse((response) => response.request() === call.request)
  call.reply.release(reply)
  await (await received).finished()
  await expect.poll(() => call.delivered).toBe(true)
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
}

async function openPreview(page: Page, keyboard = false) {
  if (keyboard) {
    await previewButton(page).focus()
    await previewButton(page).press('Enter')
  } else await previewButton(page).click()
  await expect(viewer(page)).toBeVisible()
  await expect(previewCode(page, '本次请求参数')).toBeVisible()
}

async function closePreview(page: Page) {
  await viewer(page).getByRole('button', { name: '关闭', exact: true }).last().click()
  await expect(viewer(page)).toBeHidden()
}

function expectNoPrivateData(text: string, call: PendingCall) {
  for (const forbidden of [
    definition.id,
    secondary.id,
    definition.updatedAt,
    actor,
    tenantA,
    tenantB,
    'PRIVATE_SQL_NOT_IN_REQUEST',
    privateResult,
    'allowedUserIds',
    'tenantId',
    'test-signature',
    'isolated-permission-test',
    'permission-test-auth',
    'requestId',
    call.body.requestId
  ]) {
    expect(typeof forbidden).toBe('string')
    if (typeof forbidden === 'string') expect(text).not.toContain(forbidden)
  }
}

async function bodyText(page: Page, call: PendingCall, expected = normalizedA) {
  const text = (await previewCode(page, '本次请求参数').textContent()) || ''
  const parsed: unknown = JSON.parse(text)
  expect(parsed).toEqual({ params: expected })
  expect(text).toBe(JSON.stringify({ params: expected }, null, 2))
  await expect(previewCode(page, '本次请求参数')).toHaveClass(/language-json/)
  expectNoPrivateData(text, call)
  return text
}

async function clipboardState(page: Page) {
  return page.evaluate(() => ({
    calls: window.__sqlRequestPreviewClipboard.calls.map(({ value, settled }) => ({
      value,
      settled
    })),
    legacy: [...window.__sqlRequestPreviewClipboard.legacy],
    notices: [...window.__sqlRequestPreviewClipboard.notices]
  }))
}

async function copy(
  page: Page,
  section: Locator,
  language: 'JSON' | 'PLAINTEXT',
  expected: string
) {
  const before = (await clipboardState(page)).calls.length
  await copyButton(section, language).click()
  await expect.poll(async () => (await clipboardState(page)).calls.length).toBe(before + 1)
  expect((await clipboardState(page)).calls[before].value).toBe(expected)
  return before
}

async function acknowledge(page: Page, index: number, outcome: 'success' | 'reject') {
  await page.evaluate(
    async ({ index, outcome }) => {
      const call = window.__sqlRequestPreviewClipboard.calls[index]
      if (!call || call.settled) throw new Error('The intended request-preview copy is not pending')
      call.settled = true
      if (outcome === 'success') call.resolve()
      else call.reject(new DOMException('模拟剪贴板权限拒绝', 'NotAllowedError'))
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    },
    { index, outcome }
  )
}

test('ordinary users inspect and copy dispatched parameters after changing the current form', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name)
  await expect(manager(page).getByRole('button', { name: '编辑与授权', exact: true })).toHaveCount(
    0
  )
  const call = await dispatch(page, state)
  await openPreview(page, true)
  const raw = await bodyText(page, call)
  await expect(viewer(page)).toContainText(definition.name)
  await expect(viewer(page)).toContainText(call.request.url())
  const sentAt = await viewer(page).locator('time').getAttribute('datetime')
  expect(Number.isFinite(Date.parse(sentAt || ''))).toBe(true)
  await expect(previewSection(page, '本次请求 cURL')).not.toHaveAttribute('open')
  await expect(previewSection(page, '本次请求 JavaScript')).not.toHaveAttribute('open')
  const desktopViewport = page.viewportSize()
  await page.screenshot({
    path: info.outputPath('api-request-metadata-desktop.png'),
    animations: 'disabled'
  })
  await page.setViewportSize({ width: 390, height: 844 })
  const metadata = viewer(page).locator('dl')
  await expect(metadata).toBeInViewport({ ratio: 1 })
  expect(await metadata.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({
    path: info.outputPath('api-request-metadata-narrow.png'),
    animations: 'disabled'
  })
  if (desktopViewport) await page.setViewportSize(desktopViewport)
  await closePreview(page)
  await deliver(page, call, success())
  await expect(manager(page).locator('.result-table-container')).toContainText(privateResult)
  await fillParameters(page, 'B')
  await openPreview(page)
  expect(await bodyText(page, call)).toBe(raw)
  await expect(viewer(page).locator('time')).toHaveAttribute('datetime', sentAt || '')
  const jsonCopy = await copy(page, previewSection(page, '本次请求参数'), 'JSON', raw)
  await acknowledge(page, jsonCopy, 'success')
  for (const title of ['本次请求 cURL', '本次请求 JavaScript']) {
    const section = previewSection(page, title)
    await section.locator('summary').focus()
    await section.locator('summary').press('Enter')
    await expect(previewCode(page, title)).toBeVisible()
    const text = (await previewCode(page, title).textContent()) || ''
    expect(text).toContain(call.request.url())
    expect(text).toContain('Bearer YOUR_ACCESS_TOKEN')
    expect(text).toContain('YOUR_PUBLISHABLE_KEY')
    if (title.endsWith('cURL')) expect(text).toContain(raw.replaceAll("'", "'\\''"))
    else {
      const bodyLiteral = /(?:^|\n)\s*body:\s*("(?:\\.|[^"\\])*")/.exec(text)?.[1]
      expect(
        bodyLiteral,
        'JavaScript must send the same JSON bytes, including constructor'
      ).toBeTruthy()
      const decoded: unknown = JSON.parse(bodyLiteral || 'null')
      expect(decoded).toBe(raw)
    }
    expect(text).not.toContain(queryB)
    expectNoPrivateData(text, call)
    const index = await copy(page, section, 'PLAINTEXT', text)
    await acknowledge(page, index, 'success')
  }
  const copied = await clipboardState(page)
  expect(copied.calls).toHaveLength(3)
  expect(copied.legacy).toEqual([])
  expect(copied.notices).toHaveLength(3)
  await page.screenshot({
    path: info.outputPath('api-request-preview-desktop.png'),
    animations: 'disabled'
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await previewSection(page, '本次请求参数').scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({
    path: info.outputPath('api-request-preview-narrow.png'),
    animations: 'disabled'
  })
  await closePreview(page)
  await expect(input(page, 'query')).toHaveValue(queryB)
  await expect(manager(page).locator('.result-table-container')).toContainText(privateResult)
  const box = await previewButton(page).boundingBox()
  expect(box?.height).toBe(26)
  expect(box?.width).toBe(26)
  expect(state.invokes).toHaveLength(1)
  expect(state.lists).toBe(1)
  expect(state.cancels).toEqual([])
  expect(state.mutations).toEqual([])
  expect(state.rawQueries).toEqual([])
})

test('failed and genuinely cancelled calls retain their own request without invoking from the preview', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name)
  const failed = await dispatch(page, state)
  await deliver(page, failed, {
    status: 503,
    body: { status: 'error', message: '本次调用失败，请重试' }
  })
  await expect(manager(page)).toContainText('本次调用失败，请重试')
  await openPreview(page)
  await bodyText(page, failed)
  await closePreview(page)
  const cancelled = await dispatch(page, state, 'B')
  await manager(page).getByRole('button', { name: '取消调用', exact: true }).click()
  await expect.poll(() => state.cancels.length).toBe(1)
  expect(state.cancels[0]).toEqual({
    action: 'cancel',
    requestId: cancelled.body.requestId,
    definitionId: definition.id
  })
  await openPreview(page)
  await bodyText(page, cancelled, normalizedB)
  await closePreview(page)
  await deliver(page, cancelled, {
    body: { status: 'cancelled', message: '查询已取消', durationMs: 8 }
  })
  await expect(manager(page).getByLabel('API 调用状态', { exact: true })).toContainText(
    '调用已取消'
  )
  await openPreview(page)
  await bodyText(page, cancelled, normalizedB)
  await page.screenshot({
    path: info.outputPath('api-request-cancelled.png'),
    animations: 'disabled'
  })
  expect(state.invokes).toHaveLength(2)
  expect(state.mutations).toEqual([])
  expect(state.rawQueries).toEqual([])
  expect((await clipboardState(page)).calls).toEqual([])
})

test('an invalid new invocation clears the previous request and creates no replacement snapshot', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name)
  await fillParameters(page)
  await input(page, 'amount').fill('not-a-number')
  await invokeButton(page).click()
  await expect(invokeButton(page)).toBeEnabled()
  await expect(previewButton(page)).toBeDisabled()
  expect(state.invokes).toEqual([])
  const valid = await dispatch(page, state)
  await deliver(page, valid, success())
  await expect(previewButton(page)).toBeEnabled()
  await input(page, 'amount').fill('not-a-number')
  await invokeButton(page).click()
  await expect(invokeButton(page)).toBeEnabled()
  await expect(previewButton(page)).toBeDisabled()
  await expect(viewer(page)).toBeHidden()
  expect(state.invokes).toHaveLength(1)
  expect(state.mutations).toEqual([])
  expect(state.rawQueries).toEqual([])
})

test('API selection, version refresh, main close, tenant ABA and KeepAlive clear the request context', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name, false)
  for (const boundary of ['selection', 'version', 'close', 'tenant-aba', 'keepalive'] as const) {
    const call = await dispatch(page, state)
    await deliver(page, call, success(`当前结果 ${boundary}`))
    await openPreview(page)
    await bodyText(page, call)
    await closePreview(page)
    if (boundary === 'selection') {
      await apiButton(page, secondary.name).click()
      await expect(apiButton(page, secondary.name)).toHaveAttribute('aria-pressed', 'true')
    } else if (boundary === 'version') {
      state.definitions = state.definitions.map((item) => ({
        ...item,
        updatedAt: '2026-11-01T02:00:00Z'
      }))
      const before = state.lists
      await manager(page).getByRole('button', { name: '刷新 API', exact: true }).click()
      await expect.poll(() => state.lists).toBe(before + 1)
      await expect(
        manager(page).getByRole('button', { name: '刷新 API', exact: true })
      ).toBeEnabled()
    } else if (boundary === 'close') {
      await manager(page).getByRole('button', { name: '返回 SQL 工作区', exact: true }).click()
      await expect(manager(page)).toBeHidden()
      await openManager(page)
    } else if (boundary === 'tenant-aba') {
      await page.evaluate(
        ({ tenantA, tenantB }) => {
          window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenantB }))
          window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenantA }))
        },
        { tenantA, tenantB }
      )
      await expect(manager(page)).toBeHidden()
      await openManager(page)
    } else {
      await page.evaluate(() =>
        window.dispatchEvent(new CustomEvent('sql-preview-active', { detail: false }))
      )
      await expect(manager(page)).toBeHidden()
      await page.evaluate(() =>
        window.dispatchEvent(new CustomEvent('sql-preview-active', { detail: true }))
      )
      await openManager(page)
    }
    await expect(viewer(page)).toBeHidden()
    await expect(previewButton(page)).toBeDisabled()
  }
  expect(state.invokes).toHaveLength(5)
  expect(state.cancels).toEqual([])
  expect(state.mutations).toEqual([])
  expect(state.rawQueries).toEqual([])
  expect((await clipboardState(page)).calls).toEqual([])
})

for (const outcome of ['success', 'reject'] as const) {
  test(`late clipboard ${outcome} cannot publish into a reopened request preview or clear its new copy state`, async ({
    page
  }, info) => {
    const state = await prepare(page, info.project.name, false)
    for (const boundary of ['viewer-close', 'tenant-aba', 'keepalive'] as const) {
      await page.evaluate(() => {
        window.__sqlRequestPreviewClipboard.notices.length = 0
      })
      const call = await dispatch(page, state)
      await deliver(page, call, success())
      await openPreview(page)
      const raw = await bodyText(page, call)
      const oldCopy = await copy(page, previewSection(page, '本次请求参数'), 'JSON', raw)
      if (boundary === 'viewer-close') {
        await closePreview(page)
      } else if (boundary === 'tenant-aba') {
        await page.evaluate(
          ({ tenantA, tenantB }) => {
            window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenantB }))
            window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenantA }))
          },
          { tenantA, tenantB }
        )
        await expect(viewer(page)).toBeHidden()
        await expect(manager(page)).toBeHidden()
        await openManager(page)
        const current = await dispatch(page, state)
        await deliver(page, current, success())
      } else {
        await page.evaluate(() =>
          window.dispatchEvent(new CustomEvent('sql-preview-active', { detail: false }))
        )
        await expect(viewer(page)).toBeHidden()
        await expect(manager(page)).toBeHidden()
        await page.evaluate(() =>
          window.dispatchEvent(new CustomEvent('sql-preview-active', { detail: true }))
        )
        await openManager(page)
        const current = await dispatch(page, state)
        await deliver(page, current, success())
      }
      await openPreview(page)
      expect((await previewCode(page, '本次请求参数').textContent()) || '').toBe(raw)
      const section = previewSection(page, '本次请求参数')
      const currentCopy = await copy(page, section, 'JSON', raw)
      await expect(copyButton(section, 'JSON')).toBeDisabled()
      if (boundary === 'viewer-close')
        await page.screenshot({
          path: info.outputPath('api-request-copy-pending.png'),
          animations: 'disabled'
        })
      await acknowledge(page, oldCopy, outcome)
      const stale = await clipboardState(page)
      expect(stale.legacy).toEqual([])
      expect(stale.notices).toEqual([])
      await expect(copyButton(section, 'JSON')).toBeDisabled()
      await acknowledge(page, currentCopy, 'success')
      await expect(copyButton(section, 'JSON')).toBeEnabled()
      expect((await clipboardState(page)).notices).toEqual([
        { kind: 'success', text: 'JSON 已复制' }
      ])
      await closePreview(page)
    }
    expect(state.invokes).toHaveLength(5)
    expect(state.cancels).toEqual([])
    expect(state.mutations).toEqual([])
    expect(state.rawQueries).toEqual([])
    expect((await clipboardState(page)).calls).toHaveLength(6)
  })
}
