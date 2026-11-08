import { expect, test, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import { collectAppRuntimeErrors } from './support/runtime-errors'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { prepareIsolatedSession } from './support/isolated-session'
import {
  installActionFeedbackHistory,
  readActionFeedbackHistory
} from './support/action-feedback-history'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const taskNo = 'TASK-SHARED'
const centerCode = 'CENTER-SHARED'
const runtimeErrors = new WeakMap<Page, string[]>()

function taskRow(tenantId: string) {
  return {
    id: `task-${tenantId === tenantA ? 'a' : 'b'}`,
    tenant_id: tenantId,
    task_no: taskNo,
    work_order_id: `order-${tenantId === tenantA ? 'a' : 'b'}`,
    operation_code: 'CUT',
    operation_name: '切割',
    sequence_no: 1,
    sequence_type: 'standard',
    department_id: `department-${tenantId === tenantA ? 'a' : 'b'}`,
    work_center_id: null,
    planned_quantity: 10,
    scheduled_quantity: 0,
    pending_schedule_quantity: 10,
    completed_quantity: 0,
    estimated_work_minutes: 60,
    operation_unit: '件',
    eligible_work_center_ids: [],
    scheduling_status: 'pending',
    operation_status: 'pending',
    schedule_locked: false,
    deleted_at: null,
    required_start_date: '2026-11-04',
    required_completion_date: '2026-11-05',
    allocations: [],
    workOrder: { work_order_no: 'ORDER-001', planned_start_date: '2026-11-04', urgency: 'normal' }
  }
}

function centerRow(tenantId: string) {
  return {
    id: `center-${tenantId === tenantA ? 'a' : 'b'}`,
    tenant_id: tenantId,
    department_id: `department-${tenantId === tenantA ? 'a' : 'b'}`,
    code: centerCode,
    name: '测试工作中心',
    sort: 1,
    headcount: 2,
    daily_capacity_minutes: 480,
    efficiency_percent: 100,
    utilization_percent: 100,
    parallel_capacity: 1
  }
}

function scopedRows<T extends { tenant_id: string }>(
  url: string,
  rows: T[],
  headerScope?: string
): T[] {
  const tenantFilter = new URL(url).searchParams.get('tenant_id')
  const tenantId = tenantFilter?.startsWith('eq.') ? tenantFilter.slice(3) : null
  return rows.filter(
    (row) =>
      (!tenantId || row.tenant_id === tenantId) &&
      (![tenantA, tenantB].includes(headerScope ?? '') || row.tenant_id === headerScope)
  )
}

async function scheduleWorkbook(quantities: number[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('排产导入')
  sheet.addRow(['任务单号', '工作中心编号', '排产数量', '计划开始日期', '计划结束日期'])
  for (const quantity of quantities)
    sheet.addRow([taskNo, centerCode, quantity, '2026-11-04', '2026-11-05'])
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

async function uploadSchedule(page: Page, quantities: number[]): Promise<void> {
  await expect(page.getByRole('button', { name: '导入', exact: true })).toBeEnabled()
  await page.locator('input[type="file"]').setInputFiles({
    name: '排产导入.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await scheduleWorkbook(quantities)
  })
}

async function holdSheetjs(page: Page) {
  const { promise: requested, resolve: signal } = Promise.withResolvers<void>()
  const { promise: held, resolve: release } = Promise.withResolvers<void>()
  await page.route('**/src/utils/file/sheetjs.ts*', async (route) => {
    signal()
    await held
    await route.continue()
  })
  return { requested, release }
}

async function mountScheduleImport(
  page: Page,
  ordinary = false,
  allTenantTasks = [taskRow(tenantA), taskRow(tenantB)]
) {
  const writes: Array<Record<string, unknown>> = []
  const errors = runtimeErrors.get(page) ?? []
  let taskReads = 0
  await page.route('**/rest/v1/mes_operation_task?*', (route) => {
    taskReads += 1
    const url = route.request().url()
    const headerScope = ordinary ? tenantA : route.request().headers()['x-art-tenant-scope']
    const concreteScope =
      new URL(url).searchParams.has('tenant_id') || [tenantA, tenantB].includes(headerScope)
    const rows = scopedRows(
      url,
      concreteScope ? [taskRow(tenantA), taskRow(tenantB)] : allTenantTasks,
      headerScope
    )
    return route.fulfill({
      json: rows,
      headers: {
        'content-range': `0-${rows.length - 1}/${rows.length}`,
        'access-control-expose-headers': 'Content-Range'
      }
    })
  })
  await page.route('**/rest/v1/mdm_production_department?*', (route) => {
    const rows = scopedRows(
      route.request().url(),
      [tenantA, tenantB].map((tenantId) => ({
        id: `department-${tenantId === tenantA ? 'a' : 'b'}`,
        tenant_id: tenantId,
        parent_id: null,
        name: '测试车间',
        code: 'DEPARTMENT',
        enabled: true,
        sort: 1
      })),
      ordinary ? tenantA : route.request().headers()['x-art-tenant-scope']
    )
    return route.fulfill({
      json: rows,
      headers: {
        'content-range': `0-${rows.length - 1}/${rows.length}`,
        'access-control-expose-headers': 'Content-Range'
      }
    })
  })
  await page.route('**/rest/v1/mdm_work_center?*', (route) => {
    const rows = scopedRows(
      route.request().url(),
      [centerRow(tenantA), centerRow(tenantB)],
      ordinary ? tenantA : route.request().headers()['x-art-tenant-scope']
    )
    return route.fulfill({
      json: rows,
      headers: {
        'content-range': `0-${rows.length - 1}/${rows.length}`,
        'access-control-expose-headers': 'Content-Range'
      }
    })
  })
  await page.route('**/rest/v1/rpc/mes_confirm_operation_task_schedule', (route) => {
    writes.push(route.request().postDataJSON() as Record<string, unknown>)
    return route.fulfill({ json: { id: 'allocation', scheduling_status: 'scheduled' } })
  })
  await page.goto(`/tests/e2e/fixtures/mes-scheduling-lifecycle.html${ordinary ? '?ordinary' : ''}`)
  await expect(page.getByRole('button', { name: '导入', exact: true })).toBeEnabled()
  await installActionFeedbackHistory(page, { includeWarnings: true })
  return { writes, errors, taskReads: () => taskReads }
}

async function waitForScheduleWrite(page: Page, quantity: number): Promise<void> {
  await page.waitForResponse((response) => {
    if (!new URL(response.url()).pathname.endsWith('/rpc/mes_confirm_operation_task_schedule'))
      return false
    const body = response.request().postDataJSON() as { p_quantity?: number }
    return body.p_quantity === quantity
  })
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
}

test.beforeEach(async ({ page }) => {
  runtimeErrors.set(page, collectAppRuntimeErrors(page))
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_tenant?*', (route) =>
    route.fulfill({
      json: [tenantA, tenantB].map((id, index) => ({
        id,
        tenant_name: `测试租户${index + 1}`,
        tenant_code: `test-${index + 1}`,
        status: '1'
      })),
      headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'Content-Range' }
    })
  )
  await page.route('**/rest/v1/rpc/mes_scheduling_context', (route) =>
    route.fulfill({ json: { shifts: [] } })
  )
})

test.afterEach(async ({ page }, testInfo) => {
  const errors = runtimeErrors.get(page) ?? []
  if (errors.length)
    await testInfo.attach('page-errors', {
      body: JSON.stringify(errors, null, 2),
      contentType: 'application/json'
    })
  expect(errors).toEqual([])
})

test(
  '排产工作区窄屏堆叠且专注模式可恢复',
  { tag: '@mes-responsive' },
  async ({ page }, testInfo) => {
    test.setTimeout(60_000)
    await mountScheduleImport(page)
    const workspace = page.locator('.scheduling-page__workspace')
    const tasks = page.locator('.scheduling-page__task-card')
    const overview = page.getByRole('region', { name: '工作中心任务总览' })
    await expect(tasks.getByText(taskNo, { exact: true })).toBeVisible()
    const assertLayout = async () => {
      const area = await workspace.boundingBox()
      const task = await tasks.boundingBox()
      const center = await overview.boundingBox()
      expect(area).not.toBeNull()
      expect(task).not.toBeNull()
      expect(center).not.toBeNull()
      if (!area || !task || !center) throw new Error('排产工作区未显示')
      if ((page.viewportSize()?.width ?? 1440) <= 920) {
        expect(task.width).toBeGreaterThan(area.width - 2)
        expect(center.width).toBeGreaterThan(area.width - 2)
        expect(center.y).toBeGreaterThanOrEqual(task.y + task.height)
        expect(task.height).toBeGreaterThanOrEqual(400)
        expect(center.height).toBeGreaterThanOrEqual(360)
        const identity = await tasks.locator('.art-section-card__identity').boundingBox()
        expect(identity?.width).toBeGreaterThan(task.width * 0.85)
      } else {
        expect(center.x).toBeGreaterThanOrEqual(task.x + task.width)
        expect(Math.abs(center.y - task.y)).toBeLessThan(2)
      }
      expect(
        await tasks
          .locator('.art-section-card__actions')
          .evaluate((element) => element.scrollWidth - element.clientWidth)
      ).toBeLessThanOrEqual(1)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        )
      ).toBeLessThanOrEqual(1)
    }
    await assertLayout()
    await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
    await expect(tasks).toHaveCSS('font-family', /HarmonyOS/)
    await tasks.scrollIntoViewIfNeeded()
    await captureBusinessEvidence(page, {
      path: testInfo.outputPath('schedule-task-layout.png')
    })
    await overview.scrollIntoViewIfNeeded()
    await captureBusinessEvidence(page, {
      path: testInfo.outputPath('schedule-center-layout.png')
    })
    await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
    await expect(page.getByRole('heading', { name: '排产工作台' })).toBeHidden()
    await expect(page.getByRole('region', { name: '排产查询条件' })).toBeHidden()
    await assertLayout()
    await tasks.scrollIntoViewIfNeeded()
    await captureBusinessEvidence(page, {
      path: testInfo.outputPath('schedule-focus-layout.png')
    })
    await page.getByRole('switch', { name: '退出专注模式' }).locator('..').click()
    await expect(page.getByRole('heading', { name: '排产工作台' })).toBeVisible()
    await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: '排产工作台' })).toBeVisible()
    await expect(page.getByRole('region', { name: '排产查询条件' })).toBeVisible()
    await assertLayout()
    if ((page.viewportSize()?.width ?? 0) > 920) {
      for (const width of [1280, 920]) {
        await page.setViewportSize({ width, height: 800 })
        await assertLayout()
        await tasks.scrollIntoViewIfNeeded()
        await captureBusinessEvidence(page, {
          path: testInfo.outputPath(`schedule-layout-${width}.png`)
        })
      }
    }
  }
)

test('旧租户加载完成后不会创建过期订阅', async ({ page }) => {
  const { promise: gate, resolve: releaseOld } = Promise.withResolvers<void>()
  const requests: string[] = []
  let oldFinished = false
  await page.route('**/rest/v1/mes_operation_task?*', async (route) => {
    const tenant = route.request().headers()['x-art-tenant-scope'] ?? ''
    const isOld = requests.length === 0
    requests.push(tenant)
    if (isOld) await gate
    await route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
    if (isOld) oldFinished = true
  })
  await page.goto('/tests/e2e/fixtures/mes-scheduling-lifecycle.html')
  await expect.poll(() => requests.length, { timeout: 60_000 }).toBe(1)
  await page.getByRole('button', { name: '切换测试租户' }).click()
  await expect(page.getByTestId('subscriptions')).toContainText(`mes-scheduling-${tenantB}-`)
  releaseOld()
  await expect.poll(() => oldFinished).toBe(true)
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
  const subscriptions: string[] = JSON.parse(await page.getByTestId('subscriptions').innerText())
  expect(subscriptions).toHaveLength(1)
  expect(subscriptions[0]).toContain(tenantB)
  expect(requests).toEqual([tenantA, tenantB])
  await page.getByRole('button', { name: '离开排程页面' }).click()
  await expect(page.getByTestId('removals')).toContainText(subscriptions[0])
})

test('离开页面后已排队的实时刷新不再加载', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-03T00:00:00Z') })
  let requests = 0
  await page.route('**/rest/v1/mes_operation_task?*', (route) => {
    requests += 1
    return route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
  })
  await page.goto('/tests/e2e/fixtures/mes-scheduling-lifecycle.html')
  await expect(page.getByTestId('subscriptions')).toContainText(`mes-scheduling-${tenantA}-`)
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000))
  const beforeQueuedRefresh = requests
  await page.getByRole('button', { name: '模拟实时变化' }).click()
  await page.getByRole('button', { name: '离开排程页面' }).click()
  await expect(page.getByTestId('removals')).toContainText(tenantA)
  await page.clock.runFor(600)
  expect(requests).toBe(beforeQueuedRefresh)
})

test('排产 XLSX 在 A 解析期间切 B 后丢弃旧文件，新文件只提交 B', async ({ page }) => {
  const { writes, errors } = await mountScheduleImport(page)
  const { requested, release } = await holdSheetjs(page)
  try {
    await uploadSchedule(page, [1])
    await requested
    await page.getByRole('button', { name: '切换测试租户' }).click()
    await expect(page.getByTestId('effective-tenant')).toHaveText(tenantB)
    await expect(page.locator('input[type="file"]')).toHaveValue('')
    const parsed = page.waitForResponse('**/src/utils/file/sheetjs.ts*')
    release()
    await parsed
    expect(writes).toEqual([])
    await uploadSchedule(page, [2])
    await expect
      .poll(() => readActionFeedbackHistory(page))
      .toEqual([{ kind: 'success', text: '已导入并确认 1 条排产任务' }])
    await expect
      .poll(() => writes)
      .toEqual([
        expect.objectContaining({ p_id: 'task-b', p_work_center_id: 'center-b', p_quantity: 2 })
      ])
    expect(errors).toEqual([])
  } finally {
    release()
  }
})

test('首笔 POST 等待时切 B 并启动新批，旧批不续写也不清除新批 loading', async ({
  page
}, testInfo) => {
  const { writes, errors } = await mountScheduleImport(page)
  const requested = [0, 1].map(() => Promise.withResolvers<void>())
  const held = [0, 1].map(() => Promise.withResolvers<void>())
  await page.route('**/rest/v1/rpc/mes_confirm_operation_task_schedule', async (route) => {
    const index = writes.length
    writes.push(route.request().postDataJSON() as Record<string, unknown>)
    requested[index]?.resolve()
    await held[index]?.promise
    await route.fulfill({ json: { id: `allocation-${index}`, scheduling_status: 'scheduled' } })
  })
  try {
    await uploadSchedule(page, [1, 1])
    await requested[0].promise
    await captureBusinessEvidence(page, {
      path: testInfo.outputPath('schedule-writing-a.png'),
      fullPage: true
    })
    await page.getByRole('button', { name: '切换测试租户' }).click()
    await expect(page.getByTestId('effective-tenant')).toHaveText(tenantB)
    await uploadSchedule(page, [2])
    await requested[1].promise
    const oldCompleted = waitForScheduleWrite(page, 1)
    held[0].resolve()
    await oldCompleted
    await expect(page.getByRole('button', { name: '导入', exact: true })).toBeDisabled()
    await captureBusinessEvidence(page, {
      path: testInfo.outputPath('schedule-writing-b-after-old-a.png'),
      fullPage: true
    })
    expect(writes).toEqual([
      expect.objectContaining({ p_id: 'task-a', p_work_center_id: 'center-a', p_quantity: 1 }),
      expect.objectContaining({ p_id: 'task-b', p_work_center_id: 'center-b', p_quantity: 2 })
    ])
    expect(await readActionFeedbackHistory(page)).toEqual([])
    held[1].resolve()
    await expect
      .poll(() => readActionFeedbackHistory(page))
      .toEqual([{ kind: 'success', text: '已导入并确认 1 条排产任务' }])
    expect(writes).toHaveLength(2)
    expect(errors).toEqual([])
    await captureBusinessEvidence(page, {
      path: testInfo.outputPath('schedule-import-b-success.png'),
      fullPage: true
    })
  } finally {
    held.forEach(({ resolve }) => resolve())
  }
})

test('普通用户首笔 POST 等待时撤销排产权限，旧批停止且恢复权限后可导入', async ({ page }) => {
  const { writes, errors } = await mountScheduleImport(page, true)
  const { promise: requested, resolve: signal } = Promise.withResolvers<void>()
  const { promise: held, resolve: release } = Promise.withResolvers<void>()
  let first = true
  await page.route('**/rest/v1/rpc/mes_confirm_operation_task_schedule', async (route) => {
    if (!first) return route.fallback()
    first = false
    writes.push(route.request().postDataJSON() as Record<string, unknown>)
    signal()
    await held
    await route.fulfill({ json: { id: 'old-allocation', scheduling_status: 'scheduled' } })
  })
  try {
    await uploadSchedule(page, [1, 1])
    await requested
    await page.getByRole('button', { name: '撤销排产权限' }).click()
    await expect(page.getByRole('button', { name: '导入', exact: true })).toHaveCount(0)
    const oldCompleted = waitForScheduleWrite(page, 1)
    release()
    await oldCompleted
    expect(writes).toHaveLength(1)
    expect(await readActionFeedbackHistory(page)).toEqual([])
    await page.getByRole('button', { name: '恢复排产权限' }).click()
    await page.getByRole('button', { name: '离开排程页面' }).click()
    await page.getByRole('button', { name: '返回排程页面' }).click()
    await uploadSchedule(page, [2])
    await expect
      .poll(() => writes)
      .toEqual([
        expect.objectContaining({ p_id: 'task-a', p_quantity: 1 }),
        expect.objectContaining({ p_id: 'task-a', p_quantity: 2 })
      ])
    await expect
      .poll(() => readActionFeedbackHistory(page))
      .toEqual([{ kind: 'success', text: '已导入并确认 1 条排产任务' }])
    expect(errors).toEqual([])
  } finally {
    release()
  }
})

test('平台全部租户保持 effective null 时认证租户变化也终止旧导入', async ({ page }) => {
  const { writes, errors } = await mountScheduleImport(page, false, [taskRow(tenantA)])
  await page.getByRole('button', { name: '切换全部租户' }).click()
  await expect(page.getByTestId('effective-tenant')).toHaveText('all')
  const { promise: requested, resolve: signal } = Promise.withResolvers<void>()
  const { promise: held, resolve: release } = Promise.withResolvers<void>()
  let first = true
  await page.route('**/rest/v1/rpc/mes_confirm_operation_task_schedule', async (route) => {
    if (!first) return route.fallback()
    first = false
    writes.push(route.request().postDataJSON() as Record<string, unknown>)
    signal()
    await held
    await route.fulfill({ json: { id: 'old-allocation', scheduling_status: 'scheduled' } })
  })
  try {
    await uploadSchedule(page, [1, 1])
    await requested
    await page.getByRole('button', { name: '变更认证租户' }).click()
    await expect(page.getByTestId('effective-tenant')).toHaveText('all')
    const oldCompleted = waitForScheduleWrite(page, 1)
    release()
    await oldCompleted
    expect(writes).toHaveLength(1)
    expect(await readActionFeedbackHistory(page)).toEqual([])
    await page.getByRole('button', { name: '切换测试租户' }).click()
    await expect(page.getByTestId('effective-tenant')).toHaveText(tenantB)
    await uploadSchedule(page, [2])
    await expect
      .poll(() => writes)
      .toEqual([
        expect.objectContaining({ p_id: 'task-a', p_quantity: 1 }),
        expect.objectContaining({ p_id: 'task-b', p_quantity: 2 })
      ])
    await expect
      .poll(() => readActionFeedbackHistory(page))
      .toEqual([{ kind: 'success', text: '已导入并确认 1 条排产任务' }])
    expect(errors).toEqual([])
  } finally {
    release()
  }
})

test('全部租户同编号任务拒绝歧义引用且不发送排产写入', async ({ page }, testInfo) => {
  const { writes, errors } = await mountScheduleImport(page)
  await page.getByRole('button', { name: '切换全部租户' }).click()
  await expect(page.getByTestId('effective-tenant')).toHaveText('all')
  await uploadSchedule(page, [1])
  await expect
    .poll(() => readActionFeedbackHistory(page))
    .toEqual([{ kind: 'warning', text: expect.stringContaining('多个匹配记录') }])
  expect(writes).toEqual([])
  expect(errors).toEqual([])
  await captureBusinessEvidence(page, {
    path: testInfo.outputPath('ambiguous-import-blocked.png'),
    fullPage: true
  })
})

test('当前排产被拒绝时只汇总友好原因并保留重试能力', async ({ page }) => {
  const { writes, errors } = await mountScheduleImport(page)
  let first = true
  await page.route('**/rest/v1/rpc/mes_confirm_operation_task_schedule', (route) => {
    if (!first) return route.fallback()
    first = false
    writes.push(route.request().postDataJSON() as Record<string, unknown>)
    return route.fulfill({
      status: 400,
      json: { code: '22023', message: '任务状态已变化，请刷新后重试' }
    })
  })
  await uploadSchedule(page, [1])
  await expect
    .poll(() => readActionFeedbackHistory(page))
    .toEqual([
      {
        kind: 'warning',
        text: expect.stringContaining(`任务“${taskNo}”任务状态已变化，请刷新后重试`)
      }
    ])
  await uploadSchedule(page, [1])
  await expect
    .poll(() => readActionFeedbackHistory(page))
    .toEqual([
      { kind: 'warning', text: expect.stringContaining('任务状态已变化，请刷新后重试') },
      { kind: 'success', text: '已导入并确认 1 条排产任务' }
    ])
  expect(writes).toHaveLength(2)
  expect(errors).toEqual([])
})

test('全部租户唯一任务按该任务租户解析同编号工作中心', async ({ page }, testInfo) => {
  const { writes, errors } = await mountScheduleImport(page, false, [taskRow(tenantB)])
  await page.getByRole('button', { name: '切换全部租户' }).click()
  await expect(page.getByTestId('effective-tenant')).toHaveText('all')
  await uploadSchedule(page, [1])
  await expect
    .poll(() => writes)
    .toEqual([
      expect.objectContaining({ p_id: 'task-b', p_work_center_id: 'center-b', p_quantity: 1 })
    ])
  await expect
    .poll(() => readActionFeedbackHistory(page))
    .toEqual([{ kind: 'success', text: '已导入并确认 1 条排产任务' }])
  expect(errors).toEqual([])
  await captureBusinessEvidence(page, {
    path: testInfo.outputPath('all-tenant-task-b-success.png'),
    fullPage: true
  })
})

for (const ambiguousName of [false, true]) {
  test(`工作中心引用${ambiguousName ? '同名歧义不写入' : '优先匹配编号'}`, async ({ page }) => {
    const { writes, errors, taskReads } = await mountScheduleImport(page)
    const rows = ambiguousName
      ? [
          { ...centerRow(tenantA), id: 'name-a', code: 'OTHER-A', name: centerCode },
          { ...centerRow(tenantA), id: 'name-b', code: 'OTHER-B', name: centerCode }
        ]
      : [
          { ...centerRow(tenantA), id: 'name-match', code: 'OTHER', name: centerCode },
          { ...centerRow(tenantA), id: 'code-match' }
        ]
    await page.route('**/rest/v1/mdm_work_center?*', (route) =>
      route.fulfill({
        json: rows,
        headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'Content-Range' }
      })
    )
    const beforeRefresh = taskReads()
    await page.getByRole('button', { name: '模拟实时变化' }).click()
    await expect.poll(taskReads).toBeGreaterThan(beforeRefresh)
    await uploadSchedule(page, [1])
    if (ambiguousName) {
      await expect
        .poll(() => readActionFeedbackHistory(page))
        .toEqual([{ kind: 'warning', text: expect.stringContaining('多个匹配记录') }])
      expect(writes).toEqual([])
    } else {
      await expect
        .poll(() => writes)
        .toEqual([
          expect.objectContaining({ p_id: 'task-a', p_work_center_id: 'code-match', p_quantity: 1 })
        ])
      await expect
        .poll(() => readActionFeedbackHistory(page))
        .toEqual([{ kind: 'success', text: '已导入并确认 1 条排产任务' }])
    }
    expect(errors).toEqual([])
  })
}

test('同租户 realtime 刷新不会取消正在导入的两行汇总', async ({ page }) => {
  const { writes, errors, taskReads } = await mountScheduleImport(page)
  const { promise: requested, resolve: signal } = Promise.withResolvers<void>()
  const { promise: held, resolve: release } = Promise.withResolvers<void>()
  let first = true
  await page.route('**/rest/v1/rpc/mes_confirm_operation_task_schedule', async (route) => {
    if (!first) return route.fallback()
    first = false
    writes.push(route.request().postDataJSON() as Record<string, unknown>)
    signal()
    await held
    await route.fulfill({ json: { id: 'first-allocation', scheduling_status: 'scheduled' } })
  })
  try {
    await uploadSchedule(page, [1, 1])
    await requested
    const beforeRefresh = taskReads()
    await page.getByRole('button', { name: '模拟实时变化' }).click()
    await expect.poll(taskReads).toBeGreaterThan(beforeRefresh)
    const firstCompleted = waitForScheduleWrite(page, 1)
    release()
    await firstCompleted
    await expect
      .poll(() => writes)
      .toEqual([
        expect.objectContaining({ p_id: 'task-a', p_quantity: 1 }),
        expect.objectContaining({ p_id: 'task-a', p_quantity: 1 })
      ])
    await expect
      .poll(() => readActionFeedbackHistory(page))
      .toEqual([{ kind: 'success', text: '已导入并确认 2 条排产任务' }])
    expect(errors).toEqual([])
  } finally {
    release()
  }
})
