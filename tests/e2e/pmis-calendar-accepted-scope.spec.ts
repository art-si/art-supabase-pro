import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test'
import dayjs from 'dayjs'
import ExcelJS from 'exceljs'
import { writeFile } from 'node:fs/promises'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(150_000)

const fixture = '/tests/e2e/fixtures/pmis-calendar-scope.html?mode=sheet'
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const monthA = dayjs().startOf('month')
const monthB = monthA.month() === 0 ? monthA.add(1, 'month') : monthA.subtract(1, 'month')

function task(month: dayjs.Dayjs, label: string, tenantId = tenantA) {
  return {
    id: `task-${label}`,
    tenant_id: tenantId,
    task_no: `TASK-${label}`,
    planned_date: month.date(15).format('YYYY-MM-DD'),
    shift_name: '早班',
    status: 'pending',
    task_source: 'scheduled',
    before_photo_files: [],
    after_photo_files: [],
    plan: {
      id: 'plan-a',
      plan_kind: 'inspection',
      plan_name: '测试点检方案',
      required_days: 1,
      require_photo: false,
      items: [
        {
          id: 'item-a',
          item_name: '运行状态',
          requirement: '检查运行状态',
          require_photo: false,
          sort: 1
        }
      ]
    },
    equipment: {
      id: `equipment-${label}`,
      tenant_id: tenantId,
      equipment_code: `EQ-${label}`,
      equipment_name: `设备${label}`,
      status: 'enabled',
      department: null
    },
    results: []
  }
}

function taskMonth(route: Route): string {
  const date = new URL(route.request().url()).searchParams.get('planned_date') ?? ''
  return date.match(/\d{4}-\d{2}/)?.[0] ?? ''
}

async function mockCalendar(
  page: Page,
  onTask: (route: Route) => Promise<void>,
  onEquipment?: (route: Route) => Promise<void>
) {
  await prepareIsolatedSession(page)
  const unknownWrites: string[] = []
  const taskReads: string[] = []
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const endpoint = new URL(request.url()).pathname.split('/').at(-1)
    if (endpoint === 'pmis_task') {
      taskReads.push(taskMonth(route))
      await onTask(route)
      return
    }
    if (endpoint === 'mdm_equipment' && onEquipment) {
      await onEquipment(route)
      return
    }
    if (request.method() !== 'GET') {
      unknownWrites.push(`${request.method()} ${new URL(request.url()).pathname}`)
      await route.fulfill({ status: 403, json: { message: 'Unexpected write' } })
      return
    }
    await route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  })
  return { taskReads, unknownWrites }
}

async function fulfillTask(route: Route, value: ReturnType<typeof task>) {
  await route.fulfill({
    headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
    json: [value]
  })
}

async function chooseMonthWithoutSearch(page: Page) {
  const monthInput = page.locator('.pmis-calendar .art-search-bar .el-date-editor input').first()
  await expect(monthInput).toHaveValue(monthA.format('YYYY-MM'))
  await monthInput.click()
  const monthCell = page.locator('.el-month-table td').filter({
    hasText: new RegExp(`^\\s*${monthB.format('MMM')}\\s*$`)
  })
  await expect(monthCell).toBeVisible()
  await monthCell.click()
  await expect(monthInput).toHaveValue(monthB.format('YYYY-MM'))
}

async function requireVisibleRetry(page: Page, testInfo: TestInfo, filename: string) {
  const retry = page.getByRole('button', { name: '重新加载' })
  const card = page.locator('.pmis-calendar__matrix-card')
  const wrap = card.locator('.el-scrollbar__wrap')
  await expect(retry).toBeVisible()
  const [buttonBox, cardBox, wrapBox] = await Promise.all([
    retry.boundingBox(),
    card.boundingBox(),
    wrap.boundingBox()
  ])
  if (!buttonBox || !cardBox || !wrapBox) throw new Error('重试按钮或矩阵容器缺少可测尺寸')
  const visibleBottom = Math.min(
    cardBox.y + cardBox.height,
    wrapBox.y + wrapBox.height,
    page.viewportSize()?.height ?? Number.POSITIVE_INFINITY
  )
  await writeFile(
    testInfo.outputPath(filename),
    JSON.stringify({ buttonBox, cardBox, wrapBox, visibleBottom }, null, 2)
  )
  expect(buttonBox.y).toBeGreaterThanOrEqual(wrapBox.y)
  expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(visibleBottom - 2)
  return retry
}

test('未提交月份不能改写已接受矩阵或 Excel 工作表', async ({ page }, testInfo) => {
  const { taskReads, unknownWrites } = await mockCalendar(page, (route) =>
    fulfillTask(route, task(monthA, 'A'))
  )
  await page.goto(fixture)
  await expect(page.locator('.art-table.pmis-calendar__matrix')).toContainText('设备A')
  await expect.poll(() => taskReads).toEqual([monthA.format('YYYY-MM')])
  const exportButton = page.getByRole('button', { name: '导出', exact: true })
  await expect(exportButton).toBeEnabled()
  await chooseMonthWithoutSearch(page)
  expect(taskReads).toEqual([monthA.format('YYYY-MM')])
  await page.screenshot({ path: testInfo.outputPath('month-draft-before-export.png') })

  const downloadPromise = page.waitForEvent('download')
  await exportButton.click()
  const download = await downloadPromise
  const file = testInfo.outputPath('month-draft-export.xlsx')
  await download.saveAs(file)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(file)
  const sheet = workbook.worksheets[0]
  const evidence = {
    requestedMonths: taskReads,
    draftMonth: monthB.format('YYYY-MM'),
    acceptedMonth: monthA.format('YYYY-MM'),
    sheetName: sheet.name,
    firstDateColumn: sheet.getCell('D1').value,
    day15: sheet.getCell('R2').value,
    matrixText: await page.locator('.art-table.pmis-calendar__matrix').innerText(),
    unknownWrites
  }
  await writeFile(
    testInfo.outputPath('month-draft-evidence.json'),
    JSON.stringify(evidence, null, 2)
  )
  expect(evidence.sheetName).toBe(monthA.format('YYYY年MM月'))
  expect(evidence.firstDateColumn).toBe(monthA.format('MM-01'))
  expect(evidence.day15).not.toBe('未安排')
  expect(unknownWrites).toEqual([])
})

test('较慢旧月份与租户请求不能覆盖已接受的新月份', async ({ page }) => {
  let releaseA: (() => void) | undefined
  const holdA = new Promise<void>((resolve) => {
    releaseA = resolve
  })
  let deliveredA = false
  const { taskReads, unknownWrites } = await mockCalendar(page, async (route) => {
    if (taskMonth(route) === monthA.format('YYYY-MM')) {
      await holdA
      try {
        await fulfillTask(route, task(monthA, 'A'))
      } catch {
        /* old request may abort */
      }
      deliveredA = true
      return
    }
    await fulfillTask(route, task(monthB, 'B', tenantB))
  })
  await page.goto(fixture)
  await expect.poll(() => taskReads.length).toBe(1)
  await chooseMonthWithoutSearch(page)
  await page.getByRole('button', { name: '切换租户 B' }).click()
  await expect(page.locator('.art-table.pmis-calendar__matrix')).toContainText('设备B')
  releaseA?.()
  await expect.poll(() => deliveredA).toBe(true)
  await expect.poll(() => taskReads).toEqual([monthA.format('YYYY-MM'), monthB.format('YYYY-MM')])
  await expect(page.locator('.art-table.pmis-calendar__matrix')).not.toContainText('设备A')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const path = await (await downloadPromise).path()
  if (!path) throw new Error('新月份导出未生成文件')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path)
  expect(workbook.worksheets[0].name).toBe(monthB.format('YYYY年MM月'))
  expect(workbook.worksheets[0].getCell('D1').value).toBe(monthB.format('MM-01'))
  expect(unknownWrites).toEqual([])
})

test('请求期间只改班次草稿，旧查询仍按原班次接受结果', async ({ page }) => {
  let release: (() => void) | undefined
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const { taskReads, unknownWrites } = await mockCalendar(page, async (route) => {
    await pending
    await fulfillTask(route, task(monthA, 'A'))
  })
  await page.goto(fixture)
  await expect.poll(() => taskReads.length).toBe(1)
  const shift = page.locator('.pmis-calendar .art-search-bar input[placeholder="全部班次"]')
  await expect(shift).toBeVisible()
  await shift.fill('晚班')
  release?.()
  await expect(page.locator('.art-table.pmis-calendar__matrix')).toContainText('设备A')
  expect(taskReads).toEqual([monthA.format('YYYY-MM')])
  expect(unknownWrites).toEqual([])
})

for (const scenario of [
  { label: '1440 明亮', width: 1440, height: 900, theme: 'light' },
  { label: '570 暗色', width: 570, height: 844, theme: 'dark' }
] as const) {
  test(`${scenario.label} 新查询失败时旧任务失效、指标占位且导出禁用，重试后恢复`, async ({
    page
  }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height })
    await page.emulateMedia({ colorScheme: scenario.theme, reducedMotion: 'reduce' })
    let bCalls = 0
    let allowSuccess = false
    const { taskReads, unknownWrites } = await mockCalendar(page, async (route) => {
      if (taskMonth(route) === monthB.format('YYYY-MM')) {
        bCalls++
        if (!allowSuccess) {
          await route.fulfill({
            status: 503,
            json: { code: 'XX000', message: 'temporary failure' }
          })
          return
        }
        await fulfillTask(route, task(monthB, 'B'))
        return
      }
      await fulfillTask(route, task(monthA, 'A'))
    })
    await page.goto(scenario.theme === 'dark' ? `${fixture}&theme=dark` : fixture)
    if (scenario.theme === 'dark') {
      await expect
        .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
        .toBe(true)
      expect(
        await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)
      ).toBe('dark')
    }
    const matrix = page.locator('.art-table.pmis-calendar__matrix')
    await expect(matrix).toContainText('设备A')
    await chooseMonthWithoutSearch(page)
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(page.getByText('点检日历加载失败，请重试。', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '导出', exact: true })).toBeDisabled()
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await expect(
      page.locator('.business-workspace-header__tags .el-tag').filter({ hasText: '延误 —' })
    ).toHaveClass(/el-tag--info/)
    await expect(
      page
        .locator('.business-workspace-header__metric')
        .filter({ hasText: '计划任务' })
        .locator('strong')
    ).toHaveText('—')
    await expect(matrix).toHaveCount(0)
    await expect(page.locator('.art-search-bar .el-date-editor input').first()).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('calendar-error-unknown-metrics.png') })
    const retry = await requireVisibleRetry(page, testInfo, 'calendar-error-retry-geometry.json')
    const readsBeforeRetry = bCalls
    allowSuccess = true
    await retry.focus()
    await expect(retry).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(matrix).toContainText('设备B')
    await expect(page.getByRole('button', { name: '导出', exact: true })).toBeEnabled()
    expect(bCalls).toBeGreaterThan(readsBeforeRetry)
    expect(taskReads[0]).toBe(monthA.format('YYYY-MM'))
    expect(taskReads.slice(1).every((month) => month === monthB.format('YYYY-MM'))).toBe(true)
    expect(unknownWrites).toEqual([])
  })
}

test('切换租户时立即清除旧任务和导出，旧范围响应不能回写', async ({ page }, testInfo) => {
  let releaseB: (() => void) | undefined
  const pendingB = new Promise<void>((resolve) => {
    releaseB = resolve
  })
  const scopes: string[] = []
  const { unknownWrites } = await mockCalendar(page, async (route) => {
    const scope = route.request().headers()['x-art-tenant-scope'] ?? ''
    scopes.push(scope)
    if (scope === tenantB) await pendingB
    await fulfillTask(route, task(monthA, scope === tenantB ? 'B' : 'A', scope))
  })
  await page.goto(fixture)
  const matrix = page.locator('.art-table.pmis-calendar__matrix')
  await expect(matrix).toContainText('设备A')
  await page.getByRole('button', { name: '切换租户 B' }).click()
  await expect.poll(() => scopes).toEqual([tenantA, tenantB])
  await expect(matrix).toHaveCount(0)
  await expect(page.getByRole('button', { name: '导出', exact: true })).toBeDisabled()
  await expect(
    page.locator('.business-workspace-header__tags .el-tag').filter({ hasText: '延误 —' })
  ).toHaveClass(/el-tag--info/)
  await expect(
    page
      .locator('.business-workspace-header__metric')
      .filter({ hasText: '计划任务' })
      .locator('strong')
  ).toHaveText('—')
  await expect(page.locator('.art-search-bar .el-date-editor input').first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('calendar-loading-unknown-metrics.png') })
  releaseB?.()
  await expect(matrix).toContainText('设备B')
  expect(unknownWrites).toEqual([])
})

test('570 真暗色明细：已选设备与未提交月份保持同一接受态导出', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 570, height: 844 })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  const { taskReads, unknownWrites } = await mockCalendar(
    page,
    (route) => fulfillTask(route, task(monthA, 'A')),
    (route) =>
      route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: 'equipment-A',
            tenant_id: tenantA,
            equipment_code: 'EQ-A',
            equipment_name: '设备A',
            operation_status: 'normal',
            status: 'enabled',
            department: null
          }
        ]
      })
  )
  await page.goto('/tests/e2e/fixtures/pmis-calendar-scope.html?mode=detail&theme=dark')
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
    .toBe(true)
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
    'dark'
  )
  await expect(page.getByText('请先选择设备')).toBeVisible()
  const equipment = page.getByRole('combobox', { name: '设备' })
  await expect(equipment).toBeVisible()
  await equipment.click()
  await page.getByRole('option', { name: /设备A/ }).click()
  await page.getByRole('button', { name: '查询', exact: true }).click()
  const matrix = page.locator('.art-table.pmis-calendar__matrix')
  await expect(matrix).toContainText('运行状态')
  await chooseMonthWithoutSearch(page)
  await expect(matrix).toContainText('运行状态')
  await expect(page.locator('.business-workspace-header__tags')).toContainText(
    monthA.format('YYYY年MM月')
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({ path: testInfo.outputPath('detail-accepted-scope-dark-570.png') })
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const path = await (await downloadPromise).path()
  if (!path) throw new Error('点检明细导出未生成文件')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path)
  expect(workbook.worksheets[0].name).toBe(monthA.format('YYYY年MM月'))
  expect(workbook.worksheets[0].getCell('D1').value).toBe(monthA.format('MM-01'))
  expect(workbook.worksheets[0].getCell('R2').value).not.toBe('未安排')
  expect(taskReads).toEqual([monthA.format('YYYY-MM'), monthA.format('YYYY-MM')])
  expect(unknownWrites).toEqual([])
})

for (const mode of ['sheet', 'detail'] as const) {
  test(`日历分桶保留设备首见、同日权重平局与完整日期 ${mode}`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const base = task(monthA, 'FIRST')
    const first = {
      ...base,
      status: 'pending_confirm',
      due_date: base.planned_date,
      equipment: {
        ...base.equipment,
        id: '10',
        equipment_name: '设备十',
        equipment_code: 'EQ-10',
        operation_status: 'normal'
      }
    }
    const rows = [
      first,
      {
        ...first,
        id: 'second-equipment',
        task_no: 'TASK-TWO',
        status: 'completed',
        equipment: { ...first.equipment, id: '2', equipment_name: '设备二', equipment_code: 'EQ-2' }
      },
      {
        ...first,
        id: 'same-priority',
        task_no: 'TASK-LATE',
        status: 'completed',
        completed_at: monthA.date(16).toISOString()
      },
      {
        ...first,
        id: 'second-item',
        task_no: 'TASK-ITEM',
        status: 'exempt',
        planned_date: monthA.date(16).format('YYYY-MM-DD'),
        plan: {
          ...first.plan,
          id: 'plan-b',
          plan_name: '其他点检方案',
          items: [{ ...first.plan.items[0], id: 'item-b', item_name: '润滑状态', sort: 2 }]
        }
      },
      { ...first, id: 'other-month', planned_date: monthB.date(15).format('YYYY-MM-DD') }
    ]
    const { unknownWrites } = await mockCalendar(
      page,
      (route) =>
        route.fulfill({
          json: rows,
          headers: { 'content-range': '0-4/5', 'access-control-expose-headers': 'content-range' }
        }),
      (route) =>
        route.fulfill({
          json: [first.equipment],
          headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
        })
    )
    await page.goto(`/tests/e2e/fixtures/pmis-calendar-scope.html?mode=${mode}`)
    if (mode === 'detail') {
      await page.getByRole('combobox', { name: '设备' }).click()
      await page.getByRole('option', { name: /设备十/ }).click()
      await page.getByRole('button', { name: '查询', exact: true }).click()
    }
    const matrix = page.locator('.art-table.pmis-calendar__matrix')
    await expect(matrix.locator('.pmis-calendar__identity strong')).toHaveText(
      mode === 'sheet' ? ['设备十', '设备二'] : ['运行状态', '润滑状态']
    )
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出', exact: true }).click()
    const file = testInfo.outputPath(`calendar-buckets-${mode}.xlsx`)
    await (await downloadPromise).saveAs(file)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(file)
    const sheet = workbook.worksheets[0]
    expect(sheet.getCell('R1').value).toBe(monthA.date(15).format('MM-DD'))
    expect(sheet.getCell('R2').value).toBe('待确认')
    expect(sheet.getCell('S2').value).toBe(mode === 'sheet' ? '免检' : '未安排')
    expect(sheet.getCell('R3').value).toBe(mode === 'sheet' ? '已检' : '未安排')
    if (mode === 'detail') expect(sheet.getCell('S3').value).toBe('免检')
    await page.screenshot({ path: testInfo.outputPath(`calendar-buckets-${mode}.png`) })
    await matrix
      .getByRole('button', {
        name: `${monthA.date(15).format('YYYY-MM-DD')} 待确认，查看明细`,
        exact: true
      })
      .click()
    await expect(page.locator('.el-drawer').filter({ hasText: 'TASK-FIRST' })).toBeVisible()
    expect(unknownWrites).toEqual([])
    expect(errors).toEqual([])
  })
}
