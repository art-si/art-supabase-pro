import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import {
  installActionFeedbackHistory,
  readActionFeedbackHistory
} from './support/action-feedback-history'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(60_000)

const fixture = '/tests/e2e/fixtures/smis-training-record-context.html'
const recordAId = '44444444-4444-4444-8444-444444444441'
type SavePayload = { p_id: string | null; p_submit: boolean; p_payload: Record<string, unknown> }
const state = new WeakMap<
  Page,
  { writes: SavePayload[]; unknownRest: string[]; pageErrors: string[] }
>()

test.beforeEach(async ({ page }, info) => {
  const current = {
    writes: [] as SavePayload[],
    unknownRest: [] as string[],
    pageErrors: [] as string[]
  }
  state.set(page, current)
  page.on('pageerror', (error) => current.pageErrors.push(error.message))
  await prepareIsolatedSession(page)
  await page.unroute('**/rest/v1/**')
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/rpc/smis_save_safety_training_record_secure')) {
      current.writes.push(request.postDataJSON() as SavePayload)
      return route.fulfill({ json: 'saved-training-record' })
    }
    if (path.endsWith('/sys_document_number_rule')) return route.fulfill({ json: [] })
    if (path.endsWith('/rpc/current_is_super')) return route.fulfill({ json: false })
    if (
      path.endsWith('/sys_dictionary') ||
      path.endsWith('/sys_param') ||
      path.endsWith('/sys_user') ||
      path.endsWith('/sys_tenant') ||
      path.endsWith('/rpc/get_organization_list_secure')
    )
      return route.fallback()
    current.unknownRest.push(`${request.method()} ${path}`)
    return route.abort()
  })
  const dark = info.project.name.includes('dark')
  await page.goto(`${fixture}?theme=${dark ? 'dark' : 'light'}`)
  await expect(page.locator('html')).toHaveClass(dark ? /\bdark\b/ : /^(?!.*\bdark\b)/)
  await installActionFeedbackHistory(page)
})

test.afterEach(({ page }) => {
  expect(state.get(page)?.unknownRest).toEqual([])
  expect(state.get(page)?.pageErrors).toEqual([])
})

async function openA(page: Page) {
  await page.getByTestId('open-a').click()
  await expect(page.getByTestId('open-state')).toHaveText('ready')
  const dialog = page.locator('.el-dialog:visible')
  await expect(dialog).toContainText('TR-CONTEXT-A')
  await expect(dialog).toContainText('当前租户尚未配置编号规则。')
  await expect(dialog.locator('.el-loading-mask:visible')).toHaveCount(0)
}

async function beginArchive(page: Page) {
  await page
    .locator('.el-dialog:visible')
    .getByRole('button', { name: '确认归档', exact: true })
    .click()
  await expect(page.locator('.el-message-box:visible')).toContainText('归档后记录将锁定')
}

async function confirmArchive(page: Page) {
  await page
    .locator('.el-message-box:visible')
    .getByRole('button', { name: '确认归档', exact: true })
    .click()
}

async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(
    await page
      .locator('.el-dialog:visible')
      .evaluate((dialog) => dialog.scrollWidth - dialog.clientWidth)
  ).toBeLessThanOrEqual(1)
}

test('正常归档 A 只发送 A ID、submit 与一次当前反馈', async ({ page }, info) => {
  await openA(page)
  await noHorizontalOverflow(page)
  await page.screenshot({ path: info.outputPath('training-record-a.png'), animations: 'disabled' })
  await beginArchive(page)
  await confirmArchive(page)
  await expect.poll(() => state.get(page)?.writes.length).toBe(1)
  expect(state.get(page)?.writes[0]).toMatchObject({ p_id: recordAId, p_submit: true })
  await expect(page.getByTestId('success-count')).toHaveText('1')
  expect(await readActionFeedbackHistory(page)).toEqual([
    { kind: 'success', text: '培训记录已归档，计划已完成' }
  ])
})

test('A 归档确认期间同租户打开 B 后不能用 B ID 派发旧确认', async ({ page }, info) => {
  await openA(page)
  await beginArchive(page)
  // The modal blocks ordinary clicks. This is an external parent-record change seam.
  await page.getByTestId('open-b').evaluate((button: HTMLButtonElement) => button.click())
  await expect(page.locator('.el-dialog:visible')).toContainText('TR-CONTEXT-B')
  await noHorizontalOverflow(page)
  await page.screenshot({ path: info.outputPath('training-record-b.png'), animations: 'disabled' })
  await confirmArchive(page)
  await expect(page.locator('.el-message-box')).toHaveCount(0)
  expect(state.get(page)?.writes).toEqual([])
  await expect(page.locator('.el-dialog:visible')).toContainText('TR-CONTEXT-B')
  await expect(page.getByTestId('success-count')).toHaveText('0')
  expect(await readActionFeedbackHistory(page)).toEqual([])
  await noHorizontalOverflow(page)
  await page.screenshot({
    path: info.outputPath('training-record-b-after.png'),
    animations: 'disabled'
  })
})

test('当前用户保留 Submit 但失去 Edit 时归档点击给一次权限反馈', async ({ page }) => {
  await openA(page)
  await page.getByTestId('revoke-edit').evaluate((button: HTMLButtonElement) => button.click())
  const archive = page
    .locator('.el-dialog:visible')
    .getByRole('button', { name: '确认归档', exact: true })
  await expect(archive).toBeVisible()
  await archive.click()
  await expect
    .poll(() => readActionFeedbackHistory(page))
    .toEqual([{ kind: 'error', text: '当前账号无权归档该培训记录，请刷新权限后重试' }])
  expect(state.get(page)?.writes).toEqual([])
})

for (const context of [
  { label: '路由', control: 'switch-route' },
  { label: '认证租户', control: 'switch-tenant' },
  { label: '归档权限', control: 'revoke-submit' }
]) {
  test(`A 归档确认期间${context.label}变化不派发旧写入`, async ({ page }) => {
    await openA(page)
    await beginArchive(page)
    // This button models an external context update while the modal owns pointer input.
    await page.getByTestId(context.control).evaluate((button: HTMLButtonElement) => button.click())
    await confirmArchive(page)
    await expect(page.locator('.el-message-box')).toHaveCount(0)
    expect(state.get(page)?.writes).toEqual([])
    expect(await readActionFeedbackHistory(page)).toEqual([])
  })
}

for (const outcome of ['success', 'error'] as const) {
  test(`A 写入晚到${outcome === 'success' ? '成功' : '失败'}不提示也不关闭新 B`, async ({
    page
  }) => {
    let releaseA: (() => void) | undefined
    const pendingA = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    await page.route('**/rest/v1/rpc/smis_save_safety_training_record_secure', async (route) => {
      const current = state.get(page)
      current?.writes.push(route.request().postDataJSON() as SavePayload)
      await pendingA
      await route.fulfill(
        outcome === 'success'
          ? { json: 'saved-training-record' }
          : { status: 503, json: { code: 'PGRST503', message: 'fixture delayed failure' } }
      )
    })
    try {
      await openA(page)
      await beginArchive(page)
      await confirmArchive(page)
      await expect.poll(() => state.get(page)?.writes.length).toBe(1)
      expect(state.get(page)?.writes[0]).toMatchObject({ p_id: recordAId, p_submit: true })
      await page.getByTestId('open-b').evaluate((button: HTMLButtonElement) => button.click())
      await expect(page.locator('.el-dialog:visible')).toContainText('TR-CONTEXT-B')
      const response = page.waitForResponse(
        '**/rest/v1/rpc/smis_save_safety_training_record_secure'
      )
      releaseA?.()
      await response
      await page.waitForTimeout(150)
      await expect(page.locator('.el-dialog:visible')).toContainText('TR-CONTEXT-B')
      await expect(page.getByTestId('success-count')).toHaveText('0')
      expect(await readActionFeedbackHistory(page)).toEqual([])
    } finally {
      releaseA?.()
    }
  })
}
