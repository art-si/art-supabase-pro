import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import {
  installActionFeedbackHistory,
  readActionFeedbackHistory
} from './support/action-feedback-history'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(60_000)
const testState = new WeakMap<Page, { unknownRest: string[]; pageErrors: string[] }>()
test.beforeEach(async ({ page }) => {
  const state = { unknownRest: [] as string[], pageErrors: [] as string[] }
  testState.set(page, state)
  page.on('pageerror', (error) => state.pageErrors.push(error.message))
  await prepareIsolatedSession(page)
  await page.unroute('**/rest/v1/**')
  await page.route('**/rest/v1/**', (route) => {
    state.unknownRest.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return route.abort()
  })
})
test.afterEach(({ page }) => {
  expect(testState.get(page)?.unknownRest).toEqual([])
  expect(testState.get(page)?.pageErrors).toEqual([])
})

const tenantA = '11111111-1111-4111-8111-111111111111'
const makeDefinition = (suffix: 'A' | 'B'): Api.Workflow.WorkflowDefinitionRecord => {
  const id = `44444444-4444-4444-8444-44444444444${suffix === 'A' ? 1 : 2}`
  const tenantId = tenantA
  return {
    id,
    tenantId,
    code: `WORKFLOW-${suffix}`,
    name: `审批流程 ${suffix}`,
    businessType: 'tms_waybill_cost',
    status: 'published',
    currentVersionId: `${suffix}-v2`,
    createTime: '2026-11-01T08:00:00Z',
    updateTime: '2026-11-01T08:00:00Z',
    versions: [1, 2, 3].map((versionNo) => ({
      id: `${suffix}-v${versionNo}`,
      definitionId: id,
      tenantId,
      versionNo,
      status: versionNo === 3 ? 'draft' : 'published',
      config: {
        nodes: [
          {
            key: `${suffix}-approval`,
            name: `${suffix} 审批`,
            order: 1,
            approvalMode: 'all',
            approvalThresholdPercent: 100,
            rejectVetoEnabled: true,
            allowSelfApproval: false,
            dueHours: versionNo * 24,
            reminderBeforeMinutes: 60,
            escalationEnabled: false,
            escalateAfterHours: 0,
            assignee: { type: 'roles', roleCodes: [`${suffix}-ROLE`] },
            condition: { operator: 'always' }
          }
        ],
        allowAutoApprove: false
      },
      createTime: '2026-11-01T08:00:00Z',
      updateTime: '2026-11-01T08:00:00Z'
    }))
  }
}
const definitionA = makeDefinition('A')
const definitionB = makeDefinition('B')

async function open(page: Page) {
  await page.addInitScript(
    (input) => {
      window.mainOverlayInput = input
    },
    {
      definition: definitionA,
      definitionB
    }
  )
  await page.goto('/tests/e2e/fixtures/forms-main-followup.html?mode=versions-context')
  await page.getByRole('button', { name: '打开公开入口', exact: true }).click()
  await expect(page.getByTestId('open-error')).toBeEmpty()
  await expect(page.locator('.el-dialog:visible')).toContainText('审批流程 A')
}

async function beginRestore(page: Page) {
  await page.locator('.el-dialog:visible').getByRole('button', { name: '恢复为草稿' }).click()
  await expect(page.locator('.el-message-box')).toContainText('恢复为草稿')
}

async function confirmRestore(page: Page) {
  await page.locator('.el-message-box').getByRole('button', { name: '确认生成草稿' }).click()
}

// The modal blocks normal clicks on the fixture controls. Programmatic clicks model an
// external route, tenant, permission, or parent-record update while confirmation is open.
async function externalClick(page: Page, testId: string) {
  await page.getByTestId(testId).evaluate((element) => (element as HTMLButtonElement).click())
}

test('恢复 V2 正常只提交冻结的 A 定义与版本一次', async ({ page }) => {
  const payloads: Record<string, unknown>[] = []
  await page.route('**/rest/v1/rpc/save_workflow_definition', (route) => {
    payloads.push(route.request().postDataJSON())
    return route.fulfill({
      json: { definitionId: definitionA.id, versionId: 'A-draft', versionNo: 4 }
    })
  })
  await open(page)
  await installActionFeedbackHistory(page)
  await beginRestore(page)
  await confirmRestore(page)
  await expect.poll(() => payloads.length).toBe(1)
  expect(payloads[0].p_definition).toMatchObject({
    id: definitionA.id,
    tenantId: tenantA,
    code: definitionA.code,
    changeNote: '从 V2 恢复为草稿',
    config: definitionA.versions![1].config
  })
  await expect(page.getByTestId('successes')).toHaveText('1')
  await expect(page.locator('.el-dialog:visible')).toHaveCount(0)
  expect(await readActionFeedbackHistory(page)).toEqual([{ kind: 'success', text: '操作成功' }])
})

test('打开后的版本快照不受调用方对象后续修改影响', async ({ page }) => {
  const payloads: Record<string, unknown>[] = []
  await page.route('**/rest/v1/rpc/save_workflow_definition', (route) => {
    payloads.push(route.request().postDataJSON())
    return route.fulfill({
      json: { definitionId: definitionA.id, versionId: 'draft', versionNo: 4 }
    })
  })
  await open(page)
  await externalClick(page, 'mutate-caller-definition')
  await expect(page.locator('.el-dialog:visible')).toContainText('审批流程 A')
  await expect(page.locator('.el-dialog:visible')).not.toContainText('外部已修改流程')
  await beginRestore(page)
  await confirmRestore(page)
  await expect.poll(() => payloads.length).toBe(1)
  expect(payloads[0].p_definition).toMatchObject({
    name: definitionA.name,
    config: definitionA.versions![1].config
  })
})

for (const context of [
  { name: '同租户流程 A 切换到 B', control: 'open-definition-b' },
  { name: '路由变更', control: 'switch-version-route' },
  { name: '认证租户变更', control: 'switch-version-tenant' },
  { name: '编辑权限撤销', control: 'revoke-version-edit' }
]) {
  test(`确认期间${context.name}不派发旧 A 恢复`, async ({ page }) => {
    const payloads: unknown[] = []
    await page.route('**/rest/v1/rpc/save_workflow_definition', (route) => {
      payloads.push(route.request().postDataJSON())
      return route.fulfill({
        json: { definitionId: definitionA.id, versionId: 'draft', versionNo: 4 }
      })
    })
    await open(page)
    await beginRestore(page)
    await externalClick(page, context.control)
    if (context.control === 'open-definition-b')
      await expect(page.locator('.el-dialog:visible')).toContainText('审批流程 B')
    else await expect(page.getByTestId('version-context')).not.toHaveText(`/:${tenantA}:1`)
    await confirmRestore(page)
    await expect(page.locator('.el-message-box')).toHaveCount(0)
    expect(payloads).toHaveLength(0)
    await expect(page.getByTestId('successes')).toHaveText('0')
  })
}

test('确认期间改选版本不派发已失效的版本', async ({ page }) => {
  const payloads: unknown[] = []
  await page.route('**/rest/v1/rpc/save_workflow_definition', (route) => {
    payloads.push(route.request().postDataJSON())
    return route.fulfill({
      json: { definitionId: definitionA.id, versionId: 'draft', versionNo: 4 }
    })
  })
  await open(page)
  await beginRestore(page)
  await page
    .locator('.el-dialog:visible')
    .getByRole('button', { name: /V1/ })
    .evaluate((element) => (element as HTMLButtonElement).click())
  await confirmRestore(page)
  await expect(page.locator('.el-message-box')).toHaveCount(0)
  expect(payloads).toHaveLength(0)
})

test('草稿版本不能再次恢复', async ({ page }) => {
  await open(page)
  await page.locator('.el-dialog:visible').getByRole('button', { name: /V3/ }).click()
  await expect(
    page.locator('.el-dialog:visible').getByRole('button', { name: '恢复为草稿' })
  ).toHaveCount(0)
})

test('取消恢复不派发写入也不显示反馈', async ({ page }) => {
  const payloads: unknown[] = []
  await page.route('**/rest/v1/rpc/save_workflow_definition', (route) => {
    payloads.push(route.request().postDataJSON())
    return route.fulfill({
      json: { definitionId: definitionA.id, versionId: 'draft', versionNo: 4 }
    })
  })
  await open(page)
  await installActionFeedbackHistory(page)
  await beginRestore(page)
  await page.locator('.el-message-box').getByRole('button', { name: '取消' }).click()
  await expect(page.locator('.el-message-box')).toHaveCount(0)
  expect(payloads).toHaveLength(0)
  expect(await readActionFeedbackHistory(page)).toEqual([])
  await expect(page.locator('.el-message--warning')).toHaveCount(0)
})

test('当前恢复失败给中文反馈并允许重试', async ({ page }) => {
  const payloads: unknown[] = []
  await page.route('**/rest/v1/rpc/save_workflow_definition', (route) => {
    payloads.push(route.request().postDataJSON())
    return payloads.length === 1
      ? route.fulfill({
          status: 503,
          json: { code: 'PGRST503', message: 'fixture technical failure' }
        })
      : route.fulfill({ json: { definitionId: definitionA.id, versionId: 'draft', versionNo: 4 } })
  })
  await open(page)
  await beginRestore(page)
  await confirmRestore(page)
  await expect.poll(() => payloads.length).toBe(1)
  await expect(page.locator('.el-dialog:visible')).toContainText('审批流程 A')
  await expect(page.locator('.el-message--error')).toContainText(/重试|稍后/)
  await beginRestore(page)
  await confirmRestore(page)
  await expect.poll(() => payloads.length).toBe(2)
  await expect(page.getByTestId('successes')).toHaveText('1')
})

for (const outcome of ['success', 'error'] as const) {
  test(`A 写入晚到${outcome === 'success' ? '成功' : '失败'}不通知或关闭已打开的 B`, async ({
    page
  }) => {
    let releaseWrite: (() => void) | undefined
    const pendingWrite = new Promise<void>((resolve) => {
      releaseWrite = resolve
    })
    const payloads: unknown[] = []
    await page.route('**/rest/v1/rpc/save_workflow_definition', async (route) => {
      payloads.push(route.request().postDataJSON())
      await pendingWrite
      await route.fulfill(
        outcome === 'success'
          ? { json: { definitionId: definitionA.id, versionId: 'A-draft', versionNo: 4 } }
          : { status: 503, json: { code: 'PGRST503', message: 'fixture temporary failure' } }
      )
    })
    try {
      await open(page)
      await beginRestore(page)
      await confirmRestore(page)
      await expect.poll(() => payloads.length).toBe(1)
      await externalClick(page, 'open-definition-b')
      await expect(page.locator('.el-dialog:visible')).toContainText('审批流程 B')
      await installActionFeedbackHistory(page)
      const response = page.waitForResponse('**/rest/v1/rpc/save_workflow_definition')
      releaseWrite?.()
      await response
      await page.waitForTimeout(150)
      await expect(page.locator('.el-dialog:visible')).toContainText('审批流程 B')
      await expect(page.getByTestId('successes')).toHaveText('0')
      expect(await readActionFeedbackHistory(page)).toEqual([])
    } finally {
      releaseWrite?.()
    }
  })
}

test('重复点击恢复只派发一个写请求', async ({ page }) => {
  let releaseWrite: (() => void) | undefined
  const pendingWrite = new Promise<void>((resolve) => {
    releaseWrite = resolve
  })
  const payloads: unknown[] = []
  await page.route('**/rest/v1/rpc/save_workflow_definition', async (route) => {
    payloads.push(route.request().postDataJSON())
    await pendingWrite
    await route.fulfill({
      json: { definitionId: definitionA.id, versionId: 'A-draft', versionNo: 4 }
    })
  })
  try {
    await open(page)
    const restore = page.locator('.el-dialog:visible').getByRole('button', { name: '恢复为草稿' })
    await restore.click()
    await confirmRestore(page)
    await expect.poll(() => payloads.length).toBe(1)
    await restore.evaluate((element) => (element as HTMLButtonElement).click())
    await page.waitForTimeout(100)
    const secondConfirmation = page.locator('.el-message-box')
    if (await secondConfirmation.count()) await confirmRestore(page)
    await page.waitForTimeout(100)
    expect(payloads).toHaveLength(1)
  } finally {
    releaseWrite?.()
  }
})
