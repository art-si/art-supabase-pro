import { writeFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page, type Route, type TestInfo } from '@playwright/test'
import dayjs from 'dayjs'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const otherTenantId = '22222222-2222-4222-8222-222222222222'
const metrics = (page: Page) => page.locator('.execution-analytics__metrics article strong')
const exportButton = (page: Page) => page.getByRole('button', { name: '导出', exact: true })
const reportRoute = '**/rest/v1/mes_production_report*'

function fulfillReports(route: Route, rows: object[]): Promise<void> {
  return route.fulfill({
    json: rows,
    headers: {
      'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
      'access-control-expose-headers': 'content-range'
    }
  })
}

async function expectUnknown(page: Page): Promise<void> {
  await expect(metrics(page)).toHaveText(['—', '—', '—', '—'])
  await expect(exportButton(page)).toBeDisabled()
  await expect(page.locator('.el-table__row')).toHaveCount(0)
}

async function assertUnclipped(locator: Locator, info: TestInfo, filename: string): Promise<void> {
  await expect(locator).toBeVisible()
  await locator.scrollIntoViewIfNeeded()
  const geometry = await locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const visible = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
    const ancestors: Array<{ tag: string; overflowX: string; overflowY: string }> = []
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent)
      const clipX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX)
      const clipY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY)
      if (!clipX && !clipY) continue
      const rect = parent.getBoundingClientRect()
      ancestors.push({
        tag: parent.tagName,
        overflowX: style.overflowX,
        overflowY: style.overflowY
      })
      if (clipX) {
        visible.left = Math.max(visible.left, rect.left)
        visible.right = Math.min(visible.right, rect.right)
      }
      if (clipY) {
        visible.top = Math.max(visible.top, rect.top)
        visible.bottom = Math.min(visible.bottom, rect.bottom)
      }
    }
    return {
      bounds: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom },
      visible,
      ancestors
    }
  })
  await writeFile(info.outputPath(filename), JSON.stringify(geometry, null, 2))
  expect(geometry.bounds.left).toBeGreaterThanOrEqual(geometry.visible.left - 1)
  expect(geometry.bounds.top).toBeGreaterThanOrEqual(geometry.visible.top - 1)
  expect(geometry.bounds.right).toBeLessThanOrEqual(geometry.visible.right + 1)
  expect(geometry.bounds.bottom).toBeLessThanOrEqual(geometry.visible.bottom + 1)
}

async function settlePointer(page: Page): Promise<void> {
  await page.mouse.move(1, 1)
  await expect(page.locator('.el-popper[role="tooltip"]:visible')).toHaveCount(0)
}
const task = (id: string, withStandard = true) => ({
  id,
  tenant_id: tenantId,
  task_no: `TASK-${id}`,
  work_center_id: 'center-1',
  route_step_snapshot_id: 'step-1',
  operation_code: 'OP-01',
  department: { code: 'D-01', name: '加工车间' },
  work_order: withStandard
    ? {
        route_snapshot: {
          steps: [
            {
              id: 'step-1',
              code: 'OP-01',
              run_processing_minutes: 60,
              run_output_quantity: 10
            }
          ]
        }
      }
    : null
})

function corpus(workDate: string) {
  const at = (clock: string) => `${workDate}T${clock}+08:00`
  const base = {
    tenant_id: tenantId,
    status: 'approved',
    work_center_id: 'center-1',
    shift_name: '白班',
    operator_person_ids: ['person-1'],
    good_quantity: 8,
    started_at: at('08:00:00'),
    reported_at: at('09:00:00')
  }
  const reports = [
    {
      ...base,
      id: 'report-1',
      task_id: 'task-1',
      task: task('task-1'),
      operator_person_ids: ['person-1', 'person-2']
    },
    {
      ...base,
      id: 'report-2',
      task_id: 'task-2',
      task: task('task-2'),
      good_quantity: 10,
      started_at: at('09:00:00'),
      reported_at: at('10:00:00')
    },
    {
      ...base,
      id: 'report-3',
      task_id: 'task-1',
      task: task('task-1', false),
      good_quantity: 2,
      started_at: at('08:30:00'),
      reported_at: at('09:30:00')
    }
  ]
  const intervals: Array<[string, string, string, string | null]> = [
    ['task-1', 'person-1', '08:00:00', '08:45:00'],
    ['task-1', 'person-1', '08:30:00', '09:15:00'],
    ['task-1', 'person-2', '08:15:00', '08:45:00'],
    ['task-2', 'person-1', '09:00:00', null],
    ['task-2', 'person-2', '08:00:00', '10:00:00']
  ]
  const attendance = intervals.map(([taskId, personnelId, from, to], index) => ({
    id: `attendance-${index}`,
    tenant_id: tenantId,
    task_id: taskId,
    work_center_id: 'center-1',
    personnel_id: personnelId,
    clock_in_at: at(from),
    clock_out_at: to ? at(to) : null
  }))
  const firstPerson = {
    id: 'person-1',
    tenant_id: tenantId,
    department_id: 'department-1',
    name: '首位员工',
    employee_no: 'P001',
    enabled: true
  }
  const people = [
    firstPerson,
    { ...firstPerson, name: '重复编号的后位员工' },
    { ...firstPerson, id: 'person-2', name: '次位员工', employee_no: 'P002' }
  ]
  return { reports, attendance, people }
}

async function preparePersonPage(page: Page, failReports = () => false) {
  const workDate = dayjs().format('YYYY-MM-DD')
  const data = corpus(workDate)
  const reads: string[] = []
  const unknownWrites: string[] = []
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const endpoint = new URL(request.url()).pathname.split('/').at(-1) ?? ''
    if (request.method() !== 'GET') {
      unknownWrites.push(`${request.method()} ${endpoint}`)
      return route.fulfill({ status: 403, json: { message: 'Unexpected write' } })
    }
    const rows: Record<string, unknown[]> = {
      mes_operation_task: [],
      mes_production_report: data.reports,
      mes_execution_attendance: data.attendance,
      mdm_production_personnel: data.people,
      mdm_production_department: [],
      mdm_work_center: []
    }
    if (!(endpoint in rows)) return route.fallback()
    reads.push(endpoint)
    if (endpoint === 'mes_production_report' && failReports()) {
      return route.fulfill({ status: 400, json: { code: 'XX000', message: 'synthetic failure' } })
    }
    const value = rows[endpoint] ?? []
    return route.fulfill({
      json: value,
      headers: {
        'content-range': value.length ? `0-${value.length - 1}/${value.length}` : '*/0',
        'access-control-expose-headers': 'content-range'
      }
    })
  })
  await page.route('**/rest/v1/rpc/get_table_column_runtime*', (route) =>
    route.fulfill({ json: { enabled: false, profiles: [] } })
  )
  return { workDate, reads, unknownWrites, pageErrors }
}

test('真实人工效率页按任务和人员合并出勤，保留首位身份与缺失标准时长', async ({ page }, info) => {
  const { workDate, reads, unknownWrites, pageErrors } = await preparePersonPage(page)
  await page.goto('/tests/e2e/fixtures/mes-person-efficiency.html')
  await expect(page.getByRole('heading', { name: '人工效率', exact: true })).toBeVisible()
  const first = page.locator('.el-table__row').filter({ hasText: '首位员工' })
  const second = page.locator('.el-table__row').filter({ hasText: '次位员工' })
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()
  await expect(page.locator('.el-table__row')).toHaveCount(2)
  await expect(first).toContainText('加工车间')
  await expect(first.locator('td').nth(4)).toHaveText('—')
  await expect(first.locator('td').nth(5)).toHaveText('2.00')
  await expect(first.locator('td').nth(6)).toHaveText('—')
  await expect(page.getByText('重复编号的后位员工', { exact: true })).toHaveCount(0)
  await expect(second.locator('td').nth(4)).toHaveText('0.40')
  await expect(second.locator('td').nth(5)).toHaveText('0.50')
  await expect(second.locator('td').nth(6)).toContainText('80%')
  const metrics = page.locator('.execution-analytics__metrics article strong')
  await expect(metrics).toHaveText(['2', '0.4', '2.5', '16%'])
  await expect(page.locator('.el-table__row').first()).toContainText(workDate)
  expect(reads).toEqual(
    expect.arrayContaining([
      'mes_operation_task',
      'mes_production_report',
      'mes_execution_attendance',
      'mdm_production_personnel'
    ])
  )
  expect(unknownWrites).toEqual([])
  expect(pageErrors).toEqual([])
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  await expect(
    page
      .locator('.execution-analytics .art-search-bar .el-date-editor input.el-range-input')
      .first()
  ).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: info.outputPath('mes-person-efficiency-accepted.png') })
})

for (const { width, mode } of [
  { width: 1440, mode: 'person' },
  { width: 570, mode: 'person' },
  { width: 1440, mode: 'shift' },
  { width: 1440, mode: 'machine' }
] as const) {
  test(`${mode} 统计日期完整可读 ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    const { workDate, unknownWrites, pageErrors } = await preparePersonPage(page)
    await page.goto(`/tests/e2e/fixtures/mes-person-efficiency.html?mode=${mode}`)
    await expect(page.locator('.execution-analytics .art-search-bar')).toBeVisible()
    if (mode === 'person') await expect(page.locator('.el-table__row')).toHaveCount(2)
    const dates = page.locator(
      '.execution-analytics .art-search-bar .el-date-editor input.el-range-input'
    )
    await expect(dates).toHaveCount(2)
    await expect(dates.nth(0)).toHaveValue(dayjs(workDate).subtract(6, 'day').format('YYYY-MM-DD'))
    await expect(dates.nth(1)).toHaveValue(workDate)
    const textFit = await dates.evaluateAll((inputs) =>
      inputs.map((element) => {
        const input = element as HTMLInputElement
        const style = getComputedStyle(input)
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas text measurement unavailable')
        context.font = style.font
        const textWidth = context.measureText(input.value).width
        const availableWidth =
          input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        const bounds = input.getBoundingClientRect()
        const editor = input.closest('.el-date-editor')?.getBoundingClientRect()
        return {
          value: input.value,
          textWidth,
          availableWidth,
          insideEditor: !!editor && bounds.left >= editor.left && bounds.right <= editor.right
        }
      })
    )
    for (const input of textFit) {
      expect(input.value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(input.availableWidth).toBeGreaterThanOrEqual(input.textWidth)
      expect(input.insideEditor).toBe(true)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    expect(unknownWrites).toEqual([])
    expect(pageErrors).toEqual([])
    await page.screenshot({
      path: info.outputPath(`mes-${mode}-dates-${width}.png`),
      fullPage: true
    })
  })
}

test('人工效率页失败显示可重试，刷新后恢复真实人员结果', async ({ page }, info) => {
  let fail = true
  const { reads, unknownWrites, pageErrors } = await preparePersonPage(page, () => fail)
  await page.goto('/tests/e2e/fixtures/mes-person-efficiency.html')
  await expect(page.getByText('统计数据加载失败，请重试', { exact: true })).toBeVisible()
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  await expect(
    page
      .locator('.execution-analytics .art-search-bar .el-date-editor input.el-range-input')
      .first()
  ).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: info.outputPath('mes-person-efficiency-error.png') })
  fail = false
  await page.getByRole('button', { name: '刷新页面数据', exact: true }).click()
  await expect(page.locator('.el-table__row')).toHaveCount(2)
  await expect(page.locator('.execution-analytics__metrics article strong')).toHaveText([
    '2',
    '0.4',
    '2.5',
    '16%'
  ])
  expect(reads.filter((name) => name === 'mes_production_report').length).toBeGreaterThan(1)
  expect(unknownWrites).toEqual([])
  expect(pageErrors).toEqual([])
  await page.screenshot({ path: info.outputPath('mes-person-efficiency-retry.png') })
})

for (const { width, theme } of [
  { width: 1440, theme: 'light' },
  { width: 570, theme: 'dark' }
] as const) {
  test(`人工效率 ${width} ${theme}：等待与失败未知，刷新后恢复接受态`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    const { workDate, unknownWrites, pageErrors } = await preparePersonPage(page)
    let entered!: () => void
    const pending = new Promise<void>((resolve) => (entered = resolve))
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    let attempts = 0
    await page.route(reportRoute, async (route) => {
      attempts += 1
      if (attempts === 1) {
        entered()
        await held
        await route.fulfill({ status: 400, json: { code: 'XX000', message: 'synthetic failure' } })
      } else {
        await fulfillReports(route, corpus(workDate).reports)
      }
    })
    try {
      await page.goto(`/tests/e2e/fixtures/mes-person-efficiency.html?theme=${theme}`)
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/)
      await pending
      await expectUnknown(page)
      await expect(
        page.locator('.execution-analytics .art-search-bar .el-date-editor input.el-range-input')
      ).toHaveCount(2)
      await settlePointer(page)
      await page.screenshot({
        path: info.outputPath(`mes-person-${width}-pending.png`),
        fullPage: true
      })
    } finally {
      release()
    }
    await expect(page.getByText('统计数据加载失败，请重试', { exact: true })).toBeVisible()
    await expectUnknown(page)
    await expect(page.getByText('统计结果暂不可用，请刷新重试', { exact: true })).toBeVisible()
    await assertUnclipped(
      page.getByText('统计结果暂不可用，请刷新重试', { exact: true }),
      info,
      `mes-person-${width}-error-title-geometry.json`
    )
    await assertUnclipped(
      page.getByText('统计数据加载失败，请重试', { exact: true }),
      info,
      `mes-person-${width}-error-subtitle-geometry.json`
    )
    await assertUnclipped(
      page.getByRole('button', { name: '重新加载', exact: true }),
      info,
      `mes-person-${width}-error-retry-geometry.json`
    )
    await settlePointer(page)
    await page.screenshot({
      path: info.outputPath(`mes-person-${width}-error.png`),
      fullPage: true
    })
    await page.getByRole('button', { name: '刷新页面数据', exact: true }).click()
    await expect(metrics(page)).toHaveText(['2', '0.4', '2.5', '16%'])
    await expect(exportButton(page)).toBeEnabled()
    await expect(page.locator('.el-table__row')).toHaveCount(2)
    expect(attempts).toBeGreaterThanOrEqual(2)
    expect(unknownWrites).toEqual([])
    expect(pageErrors).toEqual([])
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await settlePointer(page)
    await page.screenshot({
      path: info.outputPath(`mes-person-${width}-recovered.png`),
      fullPage: true
    })
  })
}

test('人工效率成功空结果显示真实零值且保留无数据导出反馈', async ({ page }, info) => {
  const { unknownWrites, pageErrors } = await preparePersonPage(page)
  await page.route(reportRoute, (route) => fulfillReports(route, []))
  await page.goto('/tests/e2e/fixtures/mes-person-efficiency.html')
  await expect(metrics(page)).toHaveText(['0', '0.0', '0.0', '—'])
  await expect(exportButton(page)).toBeEnabled()
  await expect(page.getByText('当前条件下暂无统计数据')).toBeVisible()
  await exportButton(page).click()
  const noDataFeedback = page.getByText('当前条件下没有可导出的统计数据')
  await expect(noDataFeedback).toBeVisible()
  expect(unknownWrites).toEqual([])
  expect(pageErrors).toEqual([])
  await expect(noDataFeedback).toBeHidden()
  await settlePointer(page)
  await page.screenshot({ path: info.outputPath('mes-person-empty-accepted.png'), fullPage: true })
})

for (const { width, theme } of [
  { width: 1440, theme: 'light' },
  { width: 570, theme: 'dark' }
] as const) {
  test(`人工效率 ${width} ${theme} 错误态可达、专注进出与键盘重试`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    let fail = true
    const { unknownWrites, pageErrors } = await preparePersonPage(page, () => fail)
    await page.goto(`/tests/e2e/fixtures/mes-person-efficiency.html?theme=${theme}`)
    await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/)
    const query = page.locator('.execution-analytics .art-table-query')
    const title = page.getByText('统计结果暂不可用，请刷新重试', { exact: true })
    const subtitle = page.getByText('统计数据加载失败，请重试', { exact: true })
    const retry = page.getByRole('button', { name: '重新加载', exact: true })
    const errorScroll = page.locator(
      '.execution-analytics__table .el-scrollbar__wrap:has([aria-label="统计数据加载状态"])'
    )
    const dateInputs = query.locator('.art-search-bar .el-date-editor input.el-range-input')
    await expect(title).toBeVisible()
    await expect(subtitle).toBeVisible()
    await expect(dateInputs).toHaveCount(2)
    await expect(dateInputs.first()).toBeVisible()
    await expect(errorScroll).toBeVisible()
    await expect(exportButton(page)).toBeDisabled()
    await expectUnknown(page)
    await assertUnclipped(title, info, `mes-focus-${width}-normal-title-geometry.json`)
    await assertUnclipped(subtitle, info, `mes-focus-${width}-normal-subtitle-geometry.json`)
    await assertUnclipped(retry, info, `mes-focus-${width}-normal-retry-geometry.json`)
    await settlePointer(page)
    await page.screenshot({ path: info.outputPath(`mes-focus-${width}-error.png`), fullPage: true })

    const enter = page.getByRole('switch', { name: '进入专注模式', exact: true })
    await enter.locator('..').click()
    await expect(query).toHaveClass(/is-focus-mode/)
    await expect(page.locator('.business-workspace-header')).toBeHidden()
    await expect(page.locator('.execution-analytics__metrics')).toBeHidden()
    if (width === 570) await expect(page.locator('.execution-analytics__scope')).toBeHidden()
    else await expect(page.locator('.execution-analytics__scope')).toBeVisible()
    await expect(query.locator('.art-search-bar')).toBeVisible()
    await expect(errorScroll).toBeVisible()
    await assertUnclipped(title, info, `mes-focus-${width}-focused-title-geometry.json`)
    await assertUnclipped(subtitle, info, `mes-focus-${width}-focused-subtitle-geometry.json`)
    await assertUnclipped(retry, info, `mes-focus-${width}-focused-retry-geometry.json`)
    await settlePointer(page)
    await page.screenshot({
      path: info.outputPath(`mes-focus-${width}-error-focused.png`),
      fullPage: true
    })

    await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
    await expect(query).not.toHaveClass(/is-focus-mode/)
    await expect(page.locator('.business-workspace-header')).toBeVisible()
    await expect(page.locator('.execution-analytics__metrics')).toBeVisible()
    await expect(page.locator('.execution-analytics__scope')).toBeVisible()
    await enter.locator('..').click()
    await expect(query).toHaveClass(/is-focus-mode/)
    await page.keyboard.press('Escape')
    await expect(query).not.toHaveClass(/is-focus-mode/)
    await expect(page.locator('.business-workspace-header')).toBeVisible()
    await expect(page.locator('.execution-analytics__metrics')).toBeVisible()
    await expect(page.locator('.execution-analytics__scope')).toBeVisible()

    fail = false
    await retry.focus()
    await expect(retry).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(metrics(page)).toHaveText(['2', '0.4', '2.5', '16%'])
    await expect(page.locator('.el-table__row')).toHaveCount(2)
    await expect(title).toHaveCount(0)
    await expect(exportButton(page)).toBeEnabled()
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await expect(page.getByText('synthetic failure')).toHaveCount(0)
    expect(unknownWrites).toEqual([])
    expect(pageErrors).toEqual([])
    await settlePointer(page)
    await page.screenshot({
      path: info.outputPath(`mes-focus-${width}-recovered.png`),
      fullPage: true
    })
    if (width === 570) {
      await page.route(reportRoute, (route) => fulfillReports(route, []))
      await page.getByRole('button', { name: '刷新页面数据', exact: true }).click()
      await expect(metrics(page)).toHaveText(['0', '0.0', '0.0', '—'])
      await expect(exportButton(page)).toBeEnabled()
      await expect(page.locator('.el-table__row')).toHaveCount(0)
      await assertUnclipped(
        page.getByText('当前条件下暂无统计数据', { exact: true }),
        info,
        'mes-focus-570-accepted-empty-geometry.json'
      )
      await settlePointer(page)
      await page.screenshot({
        path: info.outputPath('mes-focus-570-accepted-empty.png'),
        fullPage: true
      })
    }
  })
}

for (const mode of ['shift', 'line', 'machine'] as const) {
  test(`${mode} 失败未知且不可导出，重试成功空结果显示真实零值`, async ({ page }, info) => {
    const { unknownWrites, pageErrors } = await preparePersonPage(page)
    let fail = true
    await page.route(reportRoute, (route) =>
      fail
        ? route.fulfill({ status: 400, json: { code: 'XX000', message: 'synthetic failure' } })
        : fulfillReports(route, [])
    )
    await page.goto(`/tests/e2e/fixtures/mes-person-efficiency.html?mode=${mode}`)
    await expect(page.getByText('统计数据加载失败，请重试', { exact: true })).toBeVisible()
    await expectUnknown(page)
    await expect(page.getByText('统计结果暂不可用，请刷新重试', { exact: true })).toBeVisible()
    fail = false
    await page.getByRole('button', { name: '刷新页面数据', exact: true }).click()
    await expect(metrics(page)).toHaveText(['0', '0', '0', '—'])
    await expect(exportButton(page)).toBeEnabled()
    await expect(page.getByText('当前条件下暂无统计数据')).toBeVisible()
    expect(unknownWrites).toEqual([])
    expect(pageErrors).toEqual([])
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await settlePointer(page)
    await page.screenshot({
      path: info.outputPath(`mes-${mode}-empty-accepted.png`),
      fullPage: true
    })
  })
}

test('租户上下文切换后，旧请求迟到不能恢复原人员指标与导出', async ({ page }, info) => {
  const { unknownWrites, pageErrors } = await preparePersonPage(page)
  let entered!: () => void
  const pending = new Promise<void>((resolve) => (entered = resolve))
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  let oldDelivered!: () => void
  const delivered = new Promise<void>((resolve) => (oldDelivered = resolve))
  const seenTenants: string[] = []
  await page.route(reportRoute, async (route) => {
    const raw = new URL(route.request().url()).searchParams.get('tenant_id') ?? ''
    const tenant = raw.replace(/^eq\./, '')
    seenTenants.push(tenant)
    if (tenant === tenantId) {
      entered()
      await held
      await fulfillReports(route, corpus(dayjs().format('YYYY-MM-DD')).reports)
      oldDelivered()
    } else {
      await fulfillReports(route, [])
    }
  })
  try {
    await page.goto('/tests/e2e/fixtures/mes-person-efficiency.html?scope-test=1')
    await pending
    await page.evaluate((id) => {
      const bridge = window as Window & {
        __mesPersonTest?: { switchTenant: (tenantId: string) => void }
      }
      if (!bridge.__mesPersonTest) throw new Error('MES fixture scope bridge unavailable')
      bridge.__mesPersonTest.switchTenant(id)
    }, otherTenantId)
    await expect(metrics(page)).toHaveText(['0', '0.0', '0.0', '—'])
    await expect(exportButton(page)).toBeEnabled()
  } finally {
    release()
  }
  await delivered
  await page.waitForTimeout(100)
  await expect(metrics(page)).toHaveText(['0', '0.0', '0.0', '—'])
  await expect(page.locator('.el-table__row')).toHaveCount(0)
  expect(seenTenants).toContain(tenantId)
  expect(seenTenants).toContain(otherTenantId)
  expect(unknownWrites).toEqual([])
  expect(pageErrors).toEqual([])
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  await page.screenshot({
    path: info.outputPath('mes-person-tenant-stale-result-blocked.png'),
    fullPage: true
  })
})

test('日期草稿不改变接受态，A 完成后才提交 B', async ({ page }, info) => {
  const { workDate, unknownWrites, pageErrors } = await preparePersonPage(page)
  let entered!: () => void
  const pending = new Promise<void>((resolve) => (entered = resolve))
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  let oldDelivered!: () => void
  const delivered = new Promise<void>((resolve) => (oldDelivered = resolve))
  const requestedDates: string[] = []
  let requestCount = 0
  await page.route(reportRoute, async (route) => {
    const start = new URL(route.request().url()).searchParams.get('reported_at') ?? ''
    requestedDates.push(start)
    requestCount += 1
    if (requestCount === 1) {
      entered()
      await held
      await fulfillReports(route, corpus(workDate).reports)
      oldDelivered()
    } else {
      await fulfillReports(route, [])
    }
  })
  let acceptedStart: string
  try {
    await page.goto('/tests/e2e/fixtures/mes-person-efficiency.html')
    await pending
    await expectUnknown(page)
    const inputs = page.locator(
      '.execution-analytics .art-search-bar .el-date-editor input.el-range-input'
    )
    await expect(inputs).toHaveCount(2)
    await inputs.first().click()
    const panel = page.locator('.el-date-range-picker:visible')
    await expect(panel).toBeVisible()
    const futureDays = panel
      .locator('.el-date-range-picker__content')
      .nth(1)
      .locator('td.available:not(.prev-month):not(.next-month)')
    await futureDays.nth(-2).click()
    await futureDays.last().click()
    await expect(panel).toBeHidden()
    acceptedStart = await inputs.first().inputValue()
    expect(dayjs(acceptedStart).isAfter(workDate, 'day')).toBe(true)
    await expect(page.getByRole('button', { name: '查询', exact: true })).toBeDisabled()
    await expectUnknown(page)
  } finally {
    release()
  }
  await delivered
  await expect(metrics(page)).toHaveText(['2', '0.4', '2.5', '16%'])
  await expect(page.locator('.el-table__row').first()).toContainText(workDate)
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(metrics(page)).toHaveText(['0', '0.0', '0.0', '—'])
  await expect(exportButton(page)).toBeEnabled()
  await expect(page.locator('.el-table__row')).toHaveCount(0)
  expect(requestedDates).toHaveLength(2)
  expect(requestedDates[0]).not.toBe(requestedDates[1])
  expect(requestedDates[1]).toContain(acceptedStart)
  expect(unknownWrites).toEqual([])
  expect(pageErrors).toEqual([])
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('mes-person-date-b-accepted.png'), fullPage: true })
})
