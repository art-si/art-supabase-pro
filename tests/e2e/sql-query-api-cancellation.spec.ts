import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)
const tenantA = '00000000-0000-4000-8000-000000000001'
const tenantB = '00000000-0000-4000-8000-000000000002'
const actor = '00000000-0000-4000-8000-000000000003'
const definition = {
  id: '00000000-0000-4000-8000-000000000004',
  slug: 'timed-api',
  name: '耗时演示 API',
  description: '隔离测试',
  sql: 'SELECT :name AS name',
  tenantId: tenantA,
  allowedUserIds: [actor],
  parameters: [{ name: 'name', type: 'string', required: false }],
  maxRows: 200,
  timeoutMs: 10000,
  enabled: true,
  updatedAt: '2026-11-01T00:00:00Z'
}
interface Reply {
  body: object
  status?: number
}
const success = (name: string): Reply => ({
  body: {
    status: 'ok',
    rows: [{ name }],
    columns: [{ name: 'name' }],
    rowCount: 1,
    durationMs: 4,
    truncated: false,
    maxRows: 200,
    timeoutMs: 10000
  }
})
const cancelled: Reply = { body: { status: 'cancelled', message: '查询已取消', durationMs: 4 } }
function gate<T>() {
  let release!: (value: T) => void
  const wait = new Promise<T>((resolve) => {
    release = resolve
  })
  return { wait, release }
}

async function prepare(page: Page, project: string, ordinary = false, cached = false) {
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: project.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !project.includes('shadow')
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const calls: { body: Record<string, unknown>; reply: ReturnType<typeof gate<Reply>> }[] = []
  const cancels: Record<string, unknown>[] = []
  const state: {
    calls: typeof calls
    cancels: typeof cancels
    errors: string[]
    cancelReply: (index: number) => Promise<Reply>
  } = {
    calls,
    cancels,
    errors,
    cancelReply: async (): Promise<Reply> => ({
      body: { status: 'ok', state: 'cancel_requested' }
    })
  }
  await page.route('**/functions/v1/execute-sql-with-columns', (route) =>
    route.fulfill({
      json: { schemas: [], tables: [], columns: [], functions: [], foreignKeys: [] }
    })
  )
  await page.route('**/functions/v1/sql-query-api**', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    if (body.action === 'list')
      return route.fulfill({ json: { definitions: [definition], canManage: !ordinary, users: [] } })
    if (body.action === 'cancel') {
      cancels.push(body)
      const response = await state.cancelReply(cancels.length - 1)
      return route.fulfill({ status: response.status || 200, json: response.body })
    }
    const reply = gate<Reply>()
    calls.push({ body, reply })
    const response = await reply.wait
    await route.fulfill({ status: response.status || 200, json: response.body })
  })
  await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=${actor}&tenant=${tenantA}${ordinary ? '&ordinary=1' : ''}${cached ? '&keepalive=1' : ''}`
  )
  await page.evaluate((shadow) => {
    document.documentElement.dataset.boxMode = shadow ? 'shadow-mode' : 'border-mode'
    document.documentElement.dataset.uiScope = 'admin'
  }, project.includes('shadow'))
  if (ordinary)
    await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toBeDisabled()
  const open = async () => {
    await page.getByRole('button', { name: '查询 API', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '查询 API', exact: true })).toBeVisible()
  }
  await open()
  const drawer = page.getByRole('dialog', { name: '查询 API', exact: true })
  const invoke = async () => {
    const count = calls.length
    await drawer.getByRole('button', { name: '调用 API', exact: true }).click()
    await expect.poll(() => calls.length).toBe(count + 1)
    expect(calls[count].body.requestId).toMatch(
      /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i
    )
  }
  return { state, drawer, invoke, open }
}

test('ordinary API timing stays monotonic and cancel acknowledgement waits for real termination', async ({
  page
}, info) => {
  const { state, drawer, invoke } = await prepare(page, info.project.name, true)
  await page.clock.install()
  await drawer.getByRole('textbox', { name: 'API 参数 name', exact: true }).fill('原始参数')
  await invoke()
  expect(state.calls[0].body.params).toEqual({ name: '原始参数' })
  await expect(drawer.getByRole('textbox', { name: 'API 参数 name', exact: true })).toBeDisabled()
  await page.clock.fastForward(3500)
  const status = drawer.getByLabel('API 调用状态', { exact: true })
  await expect(status).toContainText('已等待 3 秒')
  await expect(status).toContainText('本次时限 10.0 s')
  await expect(status.getByRole('status')).not.toContainText('已等待')
  const cancelButton = drawer.getByRole('button', { name: '取消调用', exact: true })
  await cancelButton.scrollIntoViewIfNeeded()
  expect((await cancelButton.boundingBox())?.height).toBeGreaterThanOrEqual(24)
  await page.screenshot({ path: info.outputPath('api-call-waiting.png'), animations: 'disabled' })
  await drawer.getByRole('button', { name: '取消调用', exact: true }).click()
  await page.clock.fastForward(600)
  await expect.poll(() => state.cancels.length).toBe(1)
  await expect(drawer.getByRole('button', { name: '等待调用结束', exact: true })).toBeDisabled()
  await expect(status).not.toContainText('调用已取消')
  await page.screenshot({
    path: info.outputPath('api-cancel-acknowledged.png'),
    animations: 'disabled'
  })
  expect(state.cancels[0]).toEqual({
    action: 'cancel',
    requestId: state.calls[0].body.requestId,
    definitionId: definition.id
  })
  await page.clock.fastForward(2100)
  await expect(status).toContainText('已等待 6 秒')
  state.calls[0].reply.release(cancelled)
  await expect(status).toContainText('调用已取消')
  await expect(drawer.locator('.result-table-container')).toHaveCount(0)
  const total = await status.textContent()
  await page.clock.fastForward(5000)
  await expect(status).toHaveText(total || '')
  await page.setViewportSize({ width: 390, height: 844 })
  await status.scrollIntoViewIfNeeded()
  await expect(status).toBeInViewport({ ratio: 1 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({
    path: info.outputPath('api-cancelled-narrow.png'),
    animations: 'disabled'
  })
  expect(state.errors).toEqual([])
})

test('early cancellation retries, failed cancellation can retry and a completed query wins the race', async ({
  page
}, info) => {
  const { state, drawer, invoke } = await prepare(page, info.project.name, true)
  state.cancelReply = async (index) =>
    index === 0
      ? { body: { status: 'ok', state: 'not_running' } }
      : index === 1
        ? { status: 503, body: { status: 'error', message: '取消调用失败，请重试或等待调用结束' } }
        : { body: { status: 'ok', state: 'finished' } }
  await invoke()
  await drawer.getByRole('button', { name: '取消调用', exact: true }).click()
  await expect.poll(() => state.cancels.length).toBe(2)
  await expect(drawer).toContainText('取消调用失败，请重试或等待调用结束')
  await drawer.getByRole('button', { name: '取消调用', exact: true }).click()
  await expect.poll(() => state.cancels.length).toBe(3)
  await expect(drawer.getByRole('button', { name: '等待调用结束', exact: true })).toBeDisabled()
  state.calls[0].reply.release(success('先完成的结果'))
  await expect(drawer.locator('.result-table-container')).toContainText('先完成的结果')
  await expect(drawer.getByLabel('API 调用状态', { exact: true })).toContainText('调用完成')
  await expect(drawer.getByLabel('API 调用状态', { exact: true })).not.toContainText('调用已取消')
  expect(new Set(state.cancels.map((body) => body.requestId)).size).toBe(1)
  expect(state.errors).toEqual([])
})

test('late cancellation and invocation responses cannot change a reopened API drawer', async ({
  page
}, info) => {
  const { state, drawer, invoke, open } = await prepare(page, info.project.name)
  const acknowledgement = gate<Reply>()
  state.cancelReply = () => acknowledgement.wait
  await invoke()
  await drawer.getByRole('button', { name: '取消调用', exact: true }).click()
  await expect.poll(() => state.cancels.length).toBe(1)
  await drawer.getByRole('button', { name: '返回 SQL 工作区', exact: true }).click()
  await expect(drawer).toBeHidden()
  await open()
  await invoke()
  acknowledgement.release({ body: { status: 'ok', state: 'cancel_requested' } })
  state.calls[0].reply.release(cancelled)
  await expect(drawer.getByRole('button', { name: '取消调用', exact: true })).toBeEnabled()
  await expect(drawer.getByLabel('API 调用状态', { exact: true })).toContainText('正在调用')
  await expect(drawer.getByLabel('API 调用状态', { exact: true })).not.toContainText('调用已取消')
  state.calls[1].reply.release(success('新会话结果'))
  await expect(drawer.locator('.result-table-container')).toContainText('新会话结果')
  expect(state.calls[0].body.requestId).not.toBe(state.calls[1].body.requestId)
  expect(state.errors).toEqual([])
})

test('synchronous tenant ABA invalidates old API timer, cancellation and error finally', async ({
  page
}, info) => {
  const { state, drawer, invoke, open } = await prepare(page, info.project.name)
  const acknowledgement = gate<Reply>()
  state.cancelReply = () => acknowledgement.wait
  await invoke()
  await drawer.getByRole('button', { name: '取消调用', exact: true }).click()
  await expect.poll(() => state.cancels.length).toBe(1)
  await page.evaluate(
    ([away, back]) => {
      window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: away }))
      window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: back }))
    },
    [tenantB, tenantA]
  )
  await expect(drawer).toBeHidden()
  await open()
  await invoke()
  acknowledgement.release({ status: 503, body: { status: 'error', message: '旧的取消错误' } })
  state.calls[0].reply.release({ status: 500, body: { status: 'error', message: '旧的调用错误' } })
  await expect(drawer.getByRole('button', { name: '取消调用', exact: true })).toBeEnabled()
  await expect(drawer).not.toContainText('旧的取消错误')
  await expect(drawer).not.toContainText('旧的调用错误')
  state.calls[1].reply.release({
    status: 500,
    body: { status: 'error', message: '本次调用失败，请重试' }
  })
  await expect(drawer).toContainText('本次调用失败，请重试')
  await expect(drawer.getByLabel('API 调用状态', { exact: true })).toContainText('调用失败')
  await expect(drawer.getByRole('button', { name: '调用 API', exact: true })).toBeEnabled()
  expect(state.errors).toEqual([])
})

test('KeepAlive deactivation clears the API call before reactivation and a new invocation', async ({
  page
}, info) => {
  const { state, drawer, invoke, open } = await prepare(page, info.project.name, false, true)
  const acknowledgement = gate<Reply>()
  state.cancelReply = () => acknowledgement.wait
  await invoke()
  await drawer.getByRole('button', { name: '取消调用', exact: true }).click()
  await expect.poll(() => state.cancels.length).toBe(1)
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('sql-preview-active', { detail: false }))
  )
  await expect(drawer).toBeHidden()
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('sql-preview-active', { detail: true }))
  )
  await open()
  await invoke()
  acknowledgement.release({ body: { status: 'ok', state: 'cancel_requested' } })
  state.calls[0].reply.release(success('已停用页面的旧结果'))
  await expect(drawer.getByRole('button', { name: '取消调用', exact: true })).toBeEnabled()
  await expect(drawer).not.toContainText('已停用页面的旧结果')
  state.calls[1].reply.release(success('重新激活后的结果'))
  await expect(drawer.locator('.result-table-container')).toContainText('重新激活后的结果')
  expect(state.errors).toEqual([])
})
