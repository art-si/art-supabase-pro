import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'
import ExcelJS from 'exceljs'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'
import { contrast } from './text-contrast'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const fixture = '/tests/e2e/fixtures/mes-manufacturing-overview.html'
const evidenceDir = join(process.cwd(), '.artifacts', 'quality-audit', 'mes-manufacturing-overview')
type Mode = 'order' | 'task'

function workOrder(index: number, tenantId = tenantA) {
  const pending = index <= 8 || index === 21
  return {
    id: `order-${tenantId === tenantA ? 'a' : 'b'}-${index}`,
    tenant_id: tenantId,
    work_order_no: `WO-${String(index).padStart(3, '0')}`,
    material_id: 'material-1',
    material_code_snapshot: 'MATERIAL-1',
    material_name_snapshot: '测试物料',
    material_description: '测试物料',
    order_quantity: 10,
    unit_snapshot: '件',
    planned_end_date: '2026-11-30',
    status: pending ? 'pending' : 'confirmed',
    order_status: pending ? 'CRTD' : 'CNF',
    urgency: 'normal',
    details: [],
    route_snapshot: { steps: [] },
    bom_snapshot: [],
    extension_values: {},
    extension_schema_snapshot: [],
    confirmed_at: pending ? null : '2026-10-28T00:00:00Z',
    deleted_at: null,
    update_time: '2026-10-28T00:00:00Z',
    print_count: 0
  }
}

function operationTask(index: number, tenantId = tenantA) {
  const pending = index <= 5 || index === 21 || index === 22
  return {
    id: `task-${tenantId === tenantA ? 'a' : 'b'}-${index}`,
    tenant_id: tenantId,
    task_no: `TASK-${String(index).padStart(3, '0')}`,
    sequence_no: index,
    sequence_type: 'main',
    operation_code: `OP-${String(index).padStart(3, '0')}`,
    operation_name: `测试工序 ${index}`,
    planned_quantity: 10,
    completed_quantity: 0,
    scheduling_status: pending ? 'pending' : 'scheduled',
    operation_status: 'released',
    urgency: 'normal',
    operation_unit: '件',
    workOrder: {
      work_order_no: `WO-${String(index).padStart(3, '0')}`,
      urgency: 'normal',
      source: 'manual'
    },
    allocations: [],
    update_time: '2026-10-28T00:00:00Z'
  }
}

const row = (mode: Mode, index: number, tenantId = tenantA) =>
  mode === 'order' ? workOrder(index, tenantId) : operationTask(index, tenantId)
const values = (mode: Mode, page: 1 | 2) =>
  page === 1
    ? [25, mode === 'order' ? 8 : 5, mode === 'order' ? 12 : 15]
    : [25, mode === 'order' ? 1 : 2, mode === 'order' ? 4 : 3]
const metric = (page: Page, label: string) =>
  page.locator('.business-workspace-header__metric').filter({ hasText: label }).locator('strong')

async function expectMetrics(page: Page, mode: Mode, current: 1 | 2) {
  const [total, attention, ready] = values(mode, current)
  await expect(metric(page, '当前范围')).toHaveText(String(total))
  await expect(metric(page, mode === 'order' ? '本页待处理' : '本页待排产')).toHaveText(
    String(attention)
  )
  await expect(metric(page, mode === 'order' ? '本页已下达' : '本页已排产')).toHaveText(
    String(ready)
  )
}

interface RequestInfo {
  offset: number
  limit: number
  tenant: string | null
  keyword: string | null
}

async function mockReads(page: Page, mode: Mode, requests: RequestInfo[]) {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_dictionary?*', (route) => {
    const code = new URL(route.request().url()).searchParams
      .get('dict_type_table.code')
      ?.replace(/^eq\./, '')
    const entries: Record<
      string,
      Array<{ value: string; label: string; tagType: string | null }>
    > = {
      mesOperationTaskScheduleStatus: [
        { value: 'pending', label: '字典待排产', tagType: 'warning' },
        { value: 'scheduled', label: '字典已排产', tagType: 'primary' },
        { value: 'no_schedule', label: '字典无需排产', tagType: 'info' }
      ],
      mdmProcessRouteSequenceType: [{ value: 'main', label: '字典主序', tagType: 'primary' }],
      mesOperationStatus: [{ value: 'released', label: '字典已放行', tagType: 'primary' }],
      mesWorkOrderSource: [{ value: 'manual', label: '字典手工建单', tagType: null }]
    }
    const statuses = entries[code ?? ''] ?? []
    return route.fulfill({
      json: statuses.map((status, index) => ({
        id: `dict-${index + 1}`,
        type_id: 'task-schedule-type',
        code: status.value,
        label: status.label,
        value: status.value,
        status: '1',
        sort: index + 1,
        tag_type: status.tagType,
        dict_type_table: { code, name: code }
      }))
    })
  })
  await page.route('**/rest/v1/mes_work_order?*', (route) =>
    fulfillList(route, 'order', mode, requests)
  )
  await page.route('**/rest/v1/mes_operation_task?*', (route) =>
    fulfillList(route, 'task', mode, requests)
  )
}

function fulfillList(route: Route, source: Mode, mode: Mode, requests: RequestInfo[]) {
  if (source !== mode) return route.fulfill({ json: [] })
  const url = new URL(route.request().url())
  const offset = Number(url.searchParams.get('offset') ?? 0)
  const limit = Number(url.searchParams.get('limit') ?? 20)
  const tenant = url.searchParams.get('tenant_id')?.replace(/^eq\./, '') ?? null
  requests.push({ offset, limit, tenant, keyword: url.searchParams.get('or') })
  const rows = Array.from({ length: 25 }, (_, index) => row(mode, index + 1, tenant || tenantA))
  const pageRows = rows.slice(offset, offset + limit)
  return route.fulfill({
    json: pageRows,
    headers: {
      'content-range': pageRows.length ? `${offset}-${offset + pageRows.length - 1}/25` : '*/25',
      'access-control-expose-headers': 'content-range'
    }
  })
}

async function openFixture(
  page: Page,
  mode: Mode,
  appearance: { theme: 'light' | 'dark'; boxBorderMode: boolean },
  width: number
) {
  await page.route('**/rest/v1/rpc/get_table_column_runtime', (route) =>
    route.fulfill({ json: { enabled: false, profiles: [] } })
  )
  await page.setViewportSize({ width, height: 900 })
  await prepareAppearance(page, appearance)
  await page.goto(`${fixture}?mode=${mode}`, { waitUntil: 'domcontentloaded' })
  await assertAppearance(page, appearance)
}

async function capture(page: Page, name: string) {
  await mkdir(evidenceDir, { recursive: true })
  await page.screenshot({ path: join(evidenceDir, name), fullPage: true })
}

async function captureViewport(page: Page, name: string) {
  await mkdir(evidenceDir, { recursive: true })
  await page.screenshot({ path: join(evidenceDir, name) })
}

function tableEndpoint(mode: Mode) {
  return mode === 'order' ? 'mes_work_order' : 'mes_operation_task'
}

async function expectUnknownMetrics(page: Page, mode: Mode) {
  for (const label of [
    '当前范围',
    mode === 'order' ? '本页待处理' : '本页待排产',
    mode === 'order' ? '本页已下达' : '本页已排产'
  ]) {
    await expect(metric(page, label)).toHaveText('—')
  }
}

for (const mode of ['order', 'task'] as const) {
  test(`MES ${mode} 列表失败重试及合法空态`, async ({ page }) => {
    const requests: RequestInfo[] = []
    await prepareIsolatedSession(page)
    await mockReads(page, mode, requests)
    let attempts = 0
    let allowSuccess = false
    await page.route(`**/rest/v1/${tableEndpoint(mode)}?*`, (route) => {
      attempts += 1
      if (!allowSuccess) return route.fulfill({ status: 500, json: { message: 'temporary' } })
      return route.fulfill({
        json: [],
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
      })
    })
    await openFixture(page, mode, { theme: 'light', boxBorderMode: true }, 1440)
    await expectUnknownMetrics(page, mode)
    await expect(page.getByText('数据加载失败', { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.el-message')).toHaveCount(0)
    allowSuccess = true
    await page.getByRole('button', { name: '重新加载' }).click()
    await expect(page.getByText(mode === 'order' ? '暂无生产工单' : '暂无工序任务')).toBeVisible()
    await expect(metric(page, '当前范围')).toHaveText('0')
    await expect(metric(page, mode === 'order' ? '本页待处理' : '本页待排产')).toHaveText('0')
    await expect(metric(page, mode === 'order' ? '本页已下达' : '本页已排产')).toHaveText('0')
    expect(attempts).toBeGreaterThanOrEqual(2)
    await capture(page, `${mode}-empty-light-border-1440.png`)
  })

  test(`MES ${mode} 基础资料默认文档类型失败及页内重试`, async ({ page }) => {
    const requests: RequestInfo[] = []
    await prepareIsolatedSession(page)
    await mockReads(page, mode, requests)
    await page.route('**/rest/v1/rpc/mes_work_order_references', (route) =>
      route.fulfill({
        json: {
          materials: [],
          projects: [],
          documentTypes: [{ id: 'document-type-1', code: 'DOC', name: '生产单' }],
          employees: [],
          workCenters: []
        }
      })
    )
    let attempts = 0
    let allowSuccess = false
    await page.route('**/rest/v1/mdm_document_type?*', (route) => {
      attempts += 1
      return allowSuccess
        ? route.fulfill({ json: [{ id: 'document-type-1' }] })
        : route.fulfill({ status: 503, json: { message: 'temporary' } })
    })
    await openFixture(page, mode, { theme: 'dark', boxBorderMode: false }, 570)
    await expect(page.getByText('制造基础资料加载失败', { exact: true })).toBeVisible({
      timeout: 30_000
    })
    await expectUnknownMetrics(page, mode)
    await expect(page.locator('.el-message')).toHaveCount(0)
    await capture(page, `${mode}-context-error-dark-shadow-570.png`)
    allowSuccess = true
    await page.getByRole('button', { name: /重试|重新加载/ }).click()
    await expect(
      page.getByText(mode === 'order' ? 'WO-001' : 'TASK-001', { exact: true })
    ).toBeVisible()
    await expectMetrics(page, mode, 1)
    await expect(page.locator('.el-message')).toHaveCount(0)
    expect(attempts).toBeGreaterThanOrEqual(2)
    expect(requests.length).toBeGreaterThan(0)
  })

  test(`MES ${mode} 前置资料挂起时指标未知`, async ({ page }) => {
    await prepareIsolatedSession(page)
    const requests: RequestInfo[] = []
    await mockReads(page, mode, requests)
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/rest/v1/rpc/mes_work_order_references', async (route) => {
      await held
      await route.fulfill({
        json: { materials: [], projects: [], documentTypes: [], employees: [], workCenters: [] }
      })
    })
    try {
      await openFixture(page, mode, { theme: 'light', boxBorderMode: true }, 1440)
      await expectUnknownMetrics(page, mode)
      await expect(
        page.locator('.manufacturing-page__workspace > .art-async-state')
      ).toHaveAttribute('aria-busy', 'true')
    } finally {
      release()
    }
    await expect(
      page.getByText(mode === 'order' ? 'WO-001' : 'TASK-001', { exact: true })
    ).toBeVisible()
    await expectMetrics(page, mode, 1)
  })

  test(`MES ${mode} 旧租户列表晚到不覆盖新范围指标`, async ({ page }) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    let releaseOld!: () => void
    const oldHeld = new Promise<void>((resolve) => (releaseOld = resolve))
    let oldStarted!: () => void
    const oldRequest = new Promise<void>((resolve) => (oldStarted = resolve))
    await page.route(`**/rest/v1/${tableEndpoint(mode)}?*`, async (route) => {
      const tenant = route.request().headers()['x-art-tenant-scope']
      if (tenant === tenantA) {
        oldStarted()
        await oldHeld
      }
      const data =
        tenant === tenantB
          ? Array.from({ length: 7 }, (_, index) => ({
              ...row(mode, index + 1, tenantB),
              ...(mode === 'order'
                ? { work_order_no: `B-WO-${index + 1}` }
                : { task_no: `B-TASK-${index + 1}` })
            }))
          : Array.from({ length: 25 }, (_, index) => row(mode, index + 1, tenantA))
      const count = data.length
      try {
        await route.fulfill({
          json: data.slice(0, 20),
          headers: {
            'content-range': `0-${Math.min(count, 20) - 1}/${count}`,
            'access-control-expose-headers': 'content-range'
          }
        })
      } catch {
        // The obsolete request may already have been aborted by the table.
      }
    })
    try {
      await openFixture(page, mode, { theme: 'light', boxBorderMode: true }, 1440)
      await oldRequest
      await expectUnknownMetrics(page, mode)
      await page
        .getByTestId('switch-tenant-b')
        .evaluate((button: HTMLButtonElement) => button.click())
      await expect(
        page.getByText(mode === 'order' ? 'B-WO-1' : 'B-TASK-1', { exact: true })
      ).toBeVisible()
      await expect(metric(page, '当前范围')).toHaveText('7')
      releaseOld()
      await page.waitForTimeout(200)
      await expect(metric(page, '当前范围')).toHaveText('7')
      await expect(
        page.getByText(mode === 'order' ? 'B-WO-1' : 'B-TASK-1', { exact: true })
      ).toBeVisible()
      await capture(page, `${mode}-tenant-b-light-border-1440.png`)
    } finally {
      releaseOld()
    }
  })

  test(`MES ${mode} 旧筛选响应晚于租户切换不覆盖新指标`, async ({ page }) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    let releaseOld!: () => void
    const held = new Promise<void>((resolve) => (releaseOld = resolve))
    let oldStarted!: () => void
    const requested = new Promise<void>((resolve) => (oldStarted = resolve))
    await page.route(`**/rest/v1/${tableEndpoint(mode)}?*`, async (route) => {
      const filter = new URL(route.request().url()).searchParams.get('or') ?? ''
      const tenant = route.request().headers()['x-art-tenant-scope']
      if (tenant === tenantA && filter.includes('old')) {
        oldStarted()
        await held
      }
      const count = tenant === tenantB ? 7 : 25
      const rows = Array.from({ length: count }, (_, index) => ({
        ...row(mode, index + 1, tenant === tenantB ? tenantB : tenantA),
        ...(mode === 'order'
          ? { work_order_no: `${tenant === tenantB ? 'B-' : ''}WO-${index + 1}` }
          : { task_no: `${tenant === tenantB ? 'B-' : ''}TASK-${index + 1}` })
      })).slice(0, 20)
      try {
        await route.fulfill({
          json: rows,
          headers: {
            'content-range': `0-${rows.length - 1}/${count}`,
            'access-control-expose-headers': 'content-range'
          }
        })
      } catch {
        // The superseded filter request may have been aborted.
      }
    })
    try {
      await openFixture(page, mode, { theme: 'light', boxBorderMode: true }, 1440)
      await expectMetrics(page, mode, 1)
      const keyword = page.getByRole('textbox', { name: '关键字' })
      await keyword.fill('old')
      await page.getByRole('button', { name: '查询' }).click()
      await requested
      await page
        .getByTestId('switch-tenant-b')
        .evaluate((button: HTMLButtonElement) => button.click())
      await expect(
        page.getByText(mode === 'order' ? 'B-WO-1' : 'B-TASK-1', { exact: true })
      ).toBeVisible()
      await expect(metric(page, '当前范围')).toHaveText('7')
      releaseOld()
      await page.waitForTimeout(200)
      await expect(metric(page, '当前范围')).toHaveText('7')
      await expect(
        page.getByText(mode === 'order' ? 'B-WO-1' : 'B-TASK-1', { exact: true })
      ).toBeVisible()
    } finally {
      releaseOld()
    }
  })
  test(`MES ${mode} 20/25分页和全量导出保持当前页指标`, async ({ page }, info) => {
    const requests: RequestInfo[] = []
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await prepareIsolatedSession(page)
    await mockReads(page, mode, requests)
    await openFixture(page, mode, { theme: 'light', boxBorderMode: true }, 1440)
    await expect(
      page.getByText(mode === 'order' ? 'WO-001' : 'TASK-001', { exact: true })
    ).toBeVisible()
    await expectMetrics(page, mode, 1)
    await expect(page.locator('.el-pagination')).toBeVisible()

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出', exact: true }).first().click()
    const file = await download
    const saved = info.outputPath(`${mode}-25.xlsx`)
    await file.saveAs(saved)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(saved)
    const sheet = workbook.worksheets[0]
    expect(sheet.rowCount).toBe(26)
    expect(sheet.getCell('A2').text).toContain(mode === 'order' ? 'WO-001' : 'TASK-001')
    expect(sheet.getCell('A26').text).toContain(mode === 'order' ? 'WO-025' : 'TASK-025')
    await expectMetrics(page, mode, 1)
    expect(requests.some((request) => request.limit === 500 && request.offset === 0)).toBe(true)

    await page.locator('.el-pager li.number').filter({ hasText: /^2$/ }).click()
    await expect(
      page.getByText(mode === 'order' ? 'WO-021' : 'TASK-021', { exact: true })
    ).toBeVisible()
    await expectMetrics(page, mode, 2)
    expect(requests.some((request) => request.offset === 20 && request.limit === 20)).toBe(true)
    await capture(page, `${mode}-page2-light-border-1440.png`)
    expect(pageErrors).toEqual([])
  })

  test(`MES ${mode} 窄屏专注两种退出方式与表格完整`, async ({ page }) => {
    const requests: RequestInfo[] = []
    await prepareIsolatedSession(page)
    await mockReads(page, mode, requests)
    await openFixture(page, mode, { theme: 'dark', boxBorderMode: false }, 570)
    await expect(
      page.getByText(mode === 'order' ? 'WO-001' : 'TASK-001', { exact: true })
    ).toBeVisible()
    await expectMetrics(page, mode, 1)
    const enter = page.getByRole('switch', { name: '进入专注模式' })
    await enter.locator('..').click()
    await expect(page.locator('.manufacturing-page .business-workspace-header')).toBeHidden()
    await expect(page.locator('.art-search-bar')).toBeVisible()
    await expect(page.locator('.el-table')).toBeVisible()
    await expect(page.locator('.el-pagination')).toBeVisible()
    if (mode === 'task')
      await expect(page.locator('.production-work-center-navigator')).toBeVisible()
    await capture(page, `${mode}-focus-dark-shadow-570.png`)
    const pagination = page.locator('.el-pagination')
    await pagination.scrollIntoViewIfNeeded()
    const paginationBox = await pagination.boundingBox()
    expect(paginationBox).not.toBeNull()
    expect(paginationBox!.y).toBeGreaterThanOrEqual(0)
    expect(paginationBox!.y + paginationBox!.height).toBeLessThanOrEqual(901)
    await captureViewport(page, `${mode}-focus-pagination-dark-shadow-570.png`)
    await page.getByRole('button', { name: '退出专注模式' }).click()
    await expect(page.locator('.manufacturing-page .business-workspace-header')).toBeVisible()
    await enter.locator('..').click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.manufacturing-page .business-workspace-header')).toBeVisible()
    await expectMetrics(page, mode, 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    await capture(page, `${mode}-restored-dark-shadow-570.png`)
  })
}

for (const appearance of [
  { name: 'light-border-1440', theme: 'light' as const, boxBorderMode: true, width: 1440 },
  { name: 'dark-shadow-570', theme: 'dark' as const, boxBorderMode: false, width: 570 }
]) {
  test(`MES task 四处字典标签使用配置元数据 ${appearance.name}`, async ({ page }) => {
    const requests: RequestInfo[] = []
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await prepareIsolatedSession(page)
    await mockReads(page, 'task', requests)
    await openFixture(page, 'task', appearance, appearance.width)
    const firstRow = page.locator('.el-table__body tr').filter({ hasText: 'TASK-001' }).first()
    await expect(firstRow).toBeVisible()
    const configuredTags = [
      { label: '字典待排产', type: 'warning' },
      { label: '字典主序', type: 'primary' },
      { label: '字典已放行', type: 'primary' },
      { label: '字典手工建单', type: null }
    ]
    for (const { label, type } of configuredTags) {
      const tag = firstRow.locator('.art-dict-display__tag').filter({ hasText: label })
      await expect(tag).toHaveCount(1)
      if (type) await expect(tag).toHaveClass(new RegExp(`el-tag--${type}`))
      else await expect(tag).not.toHaveClass(/el-tag--(warning|success|danger|info)/)
      await expect(tag).toHaveClass(/el-tag--small/)
      await expect(tag).toHaveClass(/is-round/)
      await tag.scrollIntoViewIfNeeded()
      const geometry = await tag.evaluate((element) => {
        const tagBox = element.getBoundingClientRect()
        const cellBox = element.closest('td')?.getBoundingClientRect()
        return {
          height: tagBox.height,
          centerOffset: cellBox
            ? Math.abs((tagBox.top + tagBox.bottom - cellBox.top - cellBox.bottom) / 2)
            : Number.POSITIVE_INFINITY
        }
      })
      expect(geometry.height).toBeGreaterThanOrEqual(18)
      expect(geometry.height).toBeLessThanOrEqual(26)
      expect(geometry.centerOffset).toBeLessThan(5)
      const colors = await tag.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          color: style.color,
          backgroundColor: style.backgroundColor,
          opacity: style.opacity,
          themeColor: style.getPropertyValue('--theme-color').trim(),
          primaryText: style.getPropertyValue('--art-primary-text').trim()
        }
      })
      const ratio = await contrast(tag)
      console.info(
        'MES_DICT_CONTRAST',
        JSON.stringify({ appearance: appearance.name, label, ratio, ...colors })
      )
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    }
    const scheduledRow = page.locator('.el-table__body tr').filter({ hasText: 'TASK-006' }).first()
    const scheduledTag = scheduledRow
      .locator('.art-dict-display__tag')
      .filter({ hasText: '字典已排产' })
    await expect(scheduledTag).toHaveClass(/el-tag--primary/)
    await capture(page, `task-dictionary-source-${appearance.name}.png`)
    const scheduleTag = firstRow.locator('.art-dict-display__tag').filter({ hasText: '字典待排产' })
    await scheduleTag.scrollIntoViewIfNeeded()
    await capture(page, `task-dictionary-schedule-${appearance.name}.png`)
    expect(pageErrors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
  })
}

test('MES order 未知工单状态安全回退，已知状态仍使用业务标签', async ({ page }) => {
  const requests: RequestInfo[] = []
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await prepareIsolatedSession(page)
  await mockReads(page, 'order', requests)
  await page.route('**/rest/v1/mes_work_order?*', (route) =>
    route.fulfill({
      json: [{ ...workOrder(1), order_status: 'FUTURE_ORDER' }, workOrder(9)],
      headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
    })
  )
  await openFixture(page, 'order', { theme: 'dark', boxBorderMode: false }, 570)
  const unknown = page.locator('.el-table__body tr').filter({ hasText: 'WO-001' }).first()
  await expect(unknown.locator('.art-dict-display__tag')).toContainText('FUTURE_ORDER')
  const known = page.locator('.el-table__body tr').filter({ hasText: 'WO-009' }).first()
  await expect(known.locator('.work-order-status--cnf')).toContainText('CNF 已报工')
  await expect(page.locator('.el-skeleton:visible')).toHaveCount(0)
  await capture(page, 'order-unknown-status-dark-shadow-570.png')
  await unknown.locator('.art-dict-display__tag').hover()
  await expect(
    page.locator('[role="tooltip"]:visible').filter({ hasText: 'FUTURE_ORDER' })
  ).toBeVisible()
  await capture(page, 'order-unknown-status-hover-dark-shadow-570.png')
  expect(pageErrors).toEqual([])
})

test('MES task 多批导出期间工作中心切换仍保持同一导出范围', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const requests: Array<{ center: string; offset: number; limit: number }> = []
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/mdm_work_center?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'center-a',
          tenant_id: tenantA,
          department_id: 'department-1',
          code: 'A',
          name: '中心 A',
          sort: 1
        },
        {
          id: 'center-b',
          tenant_id: tenantA,
          department_id: 'department-1',
          code: 'B',
          name: '中心 B',
          sort: 2
        }
      ],
      headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
    })
  )
  let releaseAExport!: () => void
  const heldAExport = new Promise<void>((resolve) => (releaseAExport = resolve))
  let firstExportStarted!: () => void
  const exportStarted = new Promise<void>((resolve) => (firstExportStarted = resolve))
  await page.route('**/rest/v1/mes_operation_task?*', async (route) => {
    const url = new URL(route.request().url())
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit') ?? 20)
    const center = url.searchParams.get('work_center_id')?.replace(/^eq\./, '') ?? ''
    requests.push({ center, offset, limit })
    if (center === 'center-a' && offset === 0 && limit === 500) {
      firstExportStarted()
      await heldAExport
    }
    const prefix = center === 'center-b' ? 'B' : 'A'
    const rows = Array.from({ length: 501 }, (_, index) => ({
      ...operationTask(index + 1),
      id: `${prefix}-${index + 1}`,
      task_no: `${prefix}-TASK-${String(index + 1).padStart(3, '0')}`,
      work_center_id: center
    }))
    const pageRows = rows.slice(offset, offset + limit)
    await route.fulfill({
      json: pageRows,
      headers: {
        'content-range': `${offset}-${offset + pageRows.length - 1}/501`,
        'access-control-expose-headers': 'content-range'
      }
    })
  })
  try {
    await openFixture(page, 'task', { theme: 'light', boxBorderMode: true }, 1440)
    await page.getByRole('button', { name: /A · 中心 A/ }).click()
    await expect(page.getByText('A-TASK-001', { exact: true })).toBeVisible()
    await expect(metric(page, '当前范围')).toHaveText('501')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出', exact: true }).first().click()
    await exportStarted
    await page.getByRole('button', { name: /B · 中心 B/ }).click()
    await expect(page.getByText('B-TASK-001', { exact: true })).toBeVisible()
    await expect(metric(page, '当前范围')).toHaveText('501')
    releaseAExport()
    const file = await download
    const saved = info.outputPath('task-501-center-switch.xlsx')
    await file.saveAs(saved)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(saved)
    const sheet = workbook.worksheets[0]
    expect(sheet.rowCount).toBe(502)
    expect(sheet.getCell('A2').text).toContain('A-TASK-001')
    expect(sheet.getCell('A502').text).toContain('A-TASK-501')
    expect(
      requests.filter((request) => request.limit === 500).map((request) => request.center)
    ).toEqual(['center-a', 'center-a'])
  } finally {
    releaseAExport()
  }
})
