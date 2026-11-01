import { expect, test, type Locator, type Page } from '@playwright/test'
import type { SqlQueryApiDefinition } from '../../src/types/sql-query-api'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(150_000)

const actor = '00000000-0000-4000-8000-000000000081'
const tenantA = '00000000-0000-4000-8000-000000000082'
const tenantB = '00000000-0000-4000-8000-000000000083'
const definition: SqlQueryApiDefinition = {
  id: '00000000-0000-4000-8000-000000000084',
  slug: 'code-copy-lifecycle',
  name: '代码复制测试 API',
  description: '仅使用隔离数据测试代码复制的生命周期',
  sql: 'SELECT :sample AS sample',
  tenantId: tenantA,
  allowedUserIds: [actor],
  parameters: [{ name: 'sample', type: 'string', required: false }],
  enabled: true,
  maxRows: 200,
  timeoutMs: 10000,
  updatedAt: '2026-11-01T00:00:00Z'
}
const secondary: SqlQueryApiDefinition = {
  ...definition,
  id: '00000000-0000-4000-8000-000000000085',
  slug: 'another-code-copy',
  name: '另一个代码复制 API'
}

interface NativeCopyCall {
  value: string
  resolve: () => void
  reject: (cause: unknown) => void
  settled: boolean
}
interface CopyNotice {
  kind: 'success' | 'error'
  text: string
}
interface ClipboardControl {
  calls: NativeCopyCall[]
  legacy: string[]
  legacySuccess: boolean
  notices: CopyNotice[]
}
declare global {
  interface Window {
    __sqlCodeCopy: ClipboardControl
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

const copyButton = (scope: Locator) => scope.getByRole('button', { name: '复制 JSON', exact: true })
const viewer = (page: Page) => page.getByRole('dialog', { name: 'OpenAPI 规范', exact: true })
const bodyPreview = (page: Page, drawer: Locator) =>
  drawer
    .locator('details.sql-plan-code')
    .filter({ has: page.getByText('请求参数示例', { exact: true }) })
const successToast = (page: Page) =>
  page.locator('.el-message--success').filter({ hasText: 'JSON 已复制' })
const errorToast = (page: Page) =>
  page.locator('.el-message--error').filter({ hasText: '复制失败，请选择代码后手动复制' })

async function clipboardState(page: Page) {
  return page.evaluate(() => ({
    calls: window.__sqlCodeCopy.calls.map(({ value, settled }) => ({ value, settled })),
    legacy: [...window.__sqlCodeCopy.legacy],
    notices: [...window.__sqlCodeCopy.notices]
  }))
}

async function expectCalls(page: Page, count: number) {
  await expect.poll(async () => (await clipboardState(page)).calls.length).toBe(count)
}

async function acknowledge(page: Page, index: number, outcome: 'success' | 'reject') {
  await page.evaluate(
    async ({ index, outcome }) => {
      const call = window.__sqlCodeCopy.calls[index]
      if (!call || call.settled) throw new Error('The intended native copy is not pending')
      call.settled = true
      if (outcome === 'success') call.resolve()
      else call.reject(new DOMException('模拟剪贴板权限拒绝', 'NotAllowedError'))
      // The controlled native acknowledgement and its promise continuations finish
      // before the next paint; this is not a guessed timeout for stale UI work.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    },
    { index, outcome }
  )
}

async function clearNotices(page: Page) {
  await page.evaluate(() => {
    window.__sqlCodeCopy.notices.length = 0
  })
}

async function prepare(page: Page, project: string, cached = false) {
  page.setDefaultTimeout(15_000)
  page.setDefaultNavigationTimeout(60_000)
  await prepareIsolatedSession(page)
  const appearance = {
    theme: project.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !project.includes('shadow')
  } as const
  await prepareAppearance(page, appearance)
  await page.addInitScript((appearance) => {
    const state: ClipboardControl = { calls: [], legacy: [], legacySuccess: true, notices: [] }
    window.__sqlCodeCopy = state
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
        return state.legacySuccess
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
    // Keep an append-only observation of copy notices: a stale toast must not
    // pass a negative assertion merely because its normal expiry removed it.
    const seen = new WeakSet<Element>()
    new MutationObserver(() => {
      for (const element of document.querySelectorAll('.el-message')) {
        if (seen.has(element)) continue
        const text = element.textContent || ''
        const success =
          element.classList.contains('el-message--success') && text.includes('JSON 已复制')
        const error = element.classList.contains('el-message--error') && text.includes('复制失败')
        if (!success && !error) continue
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
  const state = {
    definitions: structuredClone([definition, secondary]),
    lists: 0,
    unexpected: [] as unknown[]
  }
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    const body: unknown = route.request().postDataJSON()
    if (
      typeof body !== 'object' ||
      body === null ||
      !('action' in body) ||
      body.action !== 'metadata'
    )
      state.unexpected.push(body)
    return route.fulfill({
      json: { schemas: [], tables: [], columns: [], functions: [], foreignKeys: [] }
    })
  })
  await page.route('**/functions/v1/sql-query-api**', (route) => {
    const body = route.request().postDataJSON() as { action?: string }
    if (body.action === 'list') {
      state.lists++
      return route.fulfill({ json: { definitions: state.definitions, canManage: true, users: [] } })
    }
    state.unexpected.push(body)
    return route.fulfill({ status: 400, json: { message: '代码复制不应执行查询或修改 API' } })
  })
  await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=${actor}&tenant=${tenantA}${cached ? '&keepalive=1' : ''}`
  )
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await assertAppearance(page, appearance)
  const drawer = page.getByRole('dialog', { name: '查询 API', exact: true })
  const open = async () => {
    await page.getByRole('button', { name: '查询 API', exact: true }).click()
    await expect(drawer).toBeVisible()
    await drawer.getByRole('tab', { name: '接入说明', exact: true }).click()
    await expect(bodyPreview(page, drawer)).toBeVisible()
  }
  const showOpenApi = async () => {
    await drawer.getByRole('button', { name: '预览 OpenAPI 规范', exact: true }).click()
    await expect(viewer(page)).toBeVisible()
    const code = viewer(page).locator('pre[aria-label="接口规范代码"] code')
    await expect(code).toBeVisible()
    return (await code.textContent()) || ''
  }
  const closeOpenApi = async () => {
    await viewer(page).getByRole('button', { name: '关闭', exact: true }).last().click()
    await expect(viewer(page)).toBeHidden()
  }
  await open()
  return { state, drawer, open, showOpenApi, closeOpenApi }
}

for (const outcome of ['success', 'reject'] as const) {
  test(`baseline stale native ${outcome} cannot publish into a same-content reopened OpenAPI viewer`, async ({
    page
  }, info) => {
    const { state, showOpenApi, closeOpenApi } = await prepare(page, info.project.name)
    const raw = await showOpenApi()
    await copyButton(viewer(page)).click()
    await expectCalls(page, 1)
    await closeOpenApi()
    expect(await showOpenApi()).toBe(raw)
    const currentButton = copyButton(viewer(page))
    await currentButton.click()
    await expectCalls(page, 2)
    await acknowledge(page, 0, outcome)
    const stale = await clipboardState(page)
    // These are the baseline assertions. Busy-state assertions intentionally come
    // later so the old implementation fails for stale acknowledgements themselves.
    if (outcome === 'reject') expect(stale.legacy).toEqual([])
    expect(stale.notices).toEqual([])
    expect(stale.calls.map((call) => call.value)).toEqual([raw, raw])
    await expect(currentButton).toBeDisabled()
    await acknowledge(page, 1, 'success')
    await expect(currentButton).toBeEnabled()
    await expect(successToast(page).last()).toBeVisible()
    const completed = await clipboardState(page)
    expect(completed.notices).toHaveLength(1)
    expect(completed.notices[0]).toMatchObject({ kind: 'success', text: 'JSON 已复制' })
    expect(completed.legacy).toEqual([])
    expect(state.unexpected).toEqual([])
  })
}

test('pending copy is compact and deduplicated, current failure retries, and current compatibility and native writes preserve exact text', async ({
  page
}, info) => {
  const { state, drawer } = await prepare(page, info.project.name)
  await page.setViewportSize({ width: 390, height: 844 })
  const preview = bodyPreview(page, drawer)
  const raw = (await preview.locator('code').textContent()) || ''
  const button = copyButton(preview)
  await button.scrollIntoViewIfNeeded()
  await page.evaluate(() => {
    window.__sqlCodeCopy.legacySuccess = false
  })
  await button.dblclick()
  await expectCalls(page, 1)
  await expect(button).toBeDisabled()
  expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(24)
  expect((await button.boundingBox())?.height).toBeLessThanOrEqual(28)
  await page.screenshot({
    path: info.outputPath('code-copy-pending-narrow.png'),
    animations: 'disabled'
  })
  await acknowledge(page, 0, 'reject')
  await expect(button).toBeEnabled()
  await expect(errorToast(page).last()).toBeVisible()
  let result = await clipboardState(page)
  expect(result.legacy).toEqual([raw])
  expect(result.notices).toHaveLength(1)
  expect(result.notices[0].kind).toBe('error')
  await page.screenshot({
    path: info.outputPath('code-copy-failed-narrow.png'),
    animations: 'disabled'
  })
  await clearNotices(page)
  await page.evaluate(() => {
    window.__sqlCodeCopy.legacySuccess = true
  })
  await button.click()
  await expectCalls(page, 2)
  await acknowledge(page, 1, 'reject')
  await expect(button).toBeEnabled()
  result = await clipboardState(page)
  expect(result.legacy).toEqual([raw, raw])
  expect(result.notices).toHaveLength(1)
  expect(result.notices[0].kind).toBe('success')
  await clearNotices(page)
  await button.click()
  await expectCalls(page, 3)
  await acknowledge(page, 2, 'success')
  await expect(button).toBeEnabled()
  result = await clipboardState(page)
  expect(result.calls.map((call) => call.value)).toEqual([raw, raw, raw])
  expect(result.legacy).toEqual([raw, raw])
  expect(result.notices).toHaveLength(1)
  expect(result.notices[0].kind).toBe('success')
  await page.screenshot({
    path: info.outputPath('code-copy-completed-narrow.png'),
    animations: 'disabled'
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  expect(state.unexpected).toEqual([])
})

test('selecting another API invalidates a pending copy even when the displayed request JSON is identical', async ({
  page
}, info) => {
  const { state, drawer } = await prepare(page, info.project.name)
  const first = bodyPreview(page, drawer)
  const raw = (await first.locator('code').textContent()) || ''
  await copyButton(first).click()
  await expectCalls(page, 1)
  await drawer
    .getByRole('navigation', { name: '查询 API 列表', exact: true })
    .getByRole('button', { name: /另一个代码复制 API/ })
    .click()
  await drawer.getByRole('tab', { name: '接入说明', exact: true }).click()
  const current = bodyPreview(page, drawer)
  await expect(current.locator('code')).toHaveText(raw)
  await copyButton(current).click()
  await expectCalls(page, 2)
  await acknowledge(page, 0, 'reject')
  const stale = await clipboardState(page)
  expect(stale.legacy).toEqual([])
  expect(stale.notices).toEqual([])
  await expect(copyButton(current)).toBeDisabled()
  await acknowledge(page, 1, 'success')
  await expect(copyButton(current)).toBeEnabled()
  const completed = await clipboardState(page)
  expect(completed.calls.map((call) => call.value)).toEqual([raw, raw])
  expect(completed.notices).toHaveLength(1)
  expect(completed.notices[0].kind).toBe('success')
  expect(state.unexpected).toEqual([])
})

test('version refresh, tenant ABA and KeepAlive deactivation invalidate copies without clearing a newer pending operation', async ({
  page
}, info) => {
  const { state, drawer, open } = await prepare(page, info.project.name, true)
  const raw = (await bodyPreview(page, drawer).locator('code').textContent()) || ''
  for (const [index, change] of ['version', 'tenant', 'keepalive'].entries()) {
    await clearNotices(page)
    await copyButton(bodyPreview(page, drawer)).click()
    await expectCalls(page, index * 2 + 1)
    if (change === 'version') {
      state.definitions[0].updatedAt = '2026-11-02T00:00:00Z'
      const lists = state.lists
      await drawer.getByRole('button', { name: '刷新 API', exact: true }).click()
      await expect.poll(() => state.lists).toBe(lists + 1)
      await expect(drawer.getByRole('button', { name: '刷新 API', exact: true })).toBeEnabled()
      await drawer.getByRole('tab', { name: '接入说明', exact: true }).click()
    } else {
      if (change === 'tenant') {
        await page.evaluate(
          ([away, back]) => {
            window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: away }))
            window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: back }))
          },
          [tenantB, tenantA]
        )
      } else {
        await page.evaluate(() =>
          window.dispatchEvent(new CustomEvent('sql-preview-active', { detail: false }))
        )
      }
      await expect(drawer).toBeHidden()
      if (change === 'keepalive')
        await page.evaluate(() =>
          window.dispatchEvent(new CustomEvent('sql-preview-active', { detail: true }))
        )
      await open()
    }
    const current = bodyPreview(page, drawer)
    expect((await current.locator('code').textContent()) || '').toBe(raw)
    await copyButton(current).click()
    await expectCalls(page, index * 2 + 2)
    await acknowledge(page, index * 2, index === 0 ? 'success' : 'reject')
    const stale = await clipboardState(page)
    expect(stale.legacy).toEqual([])
    expect(stale.notices).toEqual([])
    await expect(copyButton(current)).toBeDisabled()
    await acknowledge(page, index * 2 + 1, 'success')
    await expect(copyButton(current)).toBeEnabled()
    const completed = await clipboardState(page)
    expect(completed.notices).toHaveLength(1)
    expect(completed.notices[0].kind).toBe('success')
  }
  expect((await clipboardState(page)).calls.map((call) => call.value)).toEqual(Array(6).fill(raw))
  expect(state.unexpected).toEqual([])
})

test('collapsing a code preview suppresses late native rejection and fallback while a new expanded copy can succeed', async ({
  page
}, info) => {
  const { state, drawer } = await prepare(page, info.project.name)
  const preview = bodyPreview(page, drawer)
  const raw = (await preview.locator('code').textContent()) || ''
  await copyButton(preview).click()
  await expectCalls(page, 1)
  await preview.locator('summary').click()
  await expect(preview).not.toHaveAttribute('open')
  await acknowledge(page, 0, 'reject')
  const stale = await clipboardState(page)
  expect(stale.legacy).toEqual([])
  expect(stale.notices).toEqual([])
  await preview.locator('summary').click()
  await expect(copyButton(preview)).toBeVisible()
  await expect(copyButton(preview)).toBeEnabled()
  await copyButton(preview).click()
  await expectCalls(page, 2)
  await acknowledge(page, 1, 'success')
  const completed = await clipboardState(page)
  expect(completed.calls.map((call) => call.value)).toEqual([raw, raw])
  expect(completed.notices).toHaveLength(1)
  expect(completed.notices[0].kind).toBe('success')
  expect(state.unexpected).toEqual([])
})
