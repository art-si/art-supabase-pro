import { writeFile } from 'node:fs/promises'
import { expect, test, type Page, type Route } from '@playwright/test'
import dayjs from 'dayjs'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const acceptedCaption = `${dayjs().startOf('month').format('YYYY-MM-DD')} 至 ${dayjs().endOf('month').format('YYYY-MM-DD')}`

const taskRow = (label = 'A', date = dayjs().date(15)) => ({
  id: `task-${label}`,
  tenant_id: tenantId,
  task_no: `TASK-${label}`,
  planned_date: date.format('YYYY-MM-DD'),
  status: 'pending',
  task_source: 'scheduled',
  before_photo_files: [],
  after_photo_files: [],
  plan: {
    id: 'plan-A',
    plan_kind: 'inspection',
    plan_name: '测试点检方案',
    required_days: 1,
    require_photo: false,
    items: []
  },
  equipment: {
    id: `equipment-${label}`,
    tenant_id: tenantId,
    equipment_code: `EQ-${label}`,
    equipment_name: `设备${label}`,
    department: null
  },
  results: []
})

const repairRow = (label = 'A', date = dayjs().date(15)) => ({
  id: `repair-${label}`,
  tenant_id: tenantId,
  work_order_no: `REPAIR-${label}`,
  urgency: 'normal',
  fault_symptom: '测试故障',
  fault_photo_files: [],
  repair_photo_files: [],
  status: 'in_progress',
  reported_at: date.toISOString(),
  equipment: {
    id: `equipment-${label}`,
    tenant_id: tenantId,
    equipment_code: `EQ-${label}`,
    equipment_name: `设备${label}`,
    department: null
  },
  repairer: {
    id: `repairer-${label}`,
    employee_no: `EMP-${label}`,
    employee_name: `维修员${label}`
  }
})

const chooseDifferentDraftRange = async (page: Page, root: string): Promise<string> => {
  const inputs = page.locator(`${root} .art-search-bar .el-date-editor input.el-range-input`)
  await inputs.first().click()
  const panel = page.locator('.el-date-range-picker:visible')
  await expect(panel).toBeVisible()
  const months = panel.locator('.el-date-range-picker__content')
  await months.first().locator('td.available:not(.prev-month):not(.next-month)').first().click()
  await months.nth(1).locator('td.available:not(.prev-month):not(.next-month)').first().click()
  await expect(panel).toBeHidden()
  return `${await inputs.first().inputValue()} 至 ${await inputs.nth(1).inputValue()}`
}

const fulfillRows = (route: Route, row: object): Promise<void> =>
  route.fulfill({
    headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
    json: [row]
  })

const scenarios = [
  {
    view: 'repair',
    table: 'pmis_repair_task',
    root: '.pmis-repair-analysis',
    marker: '维修员A',
    row: repairRow()
  },
  {
    view: 'analysis',
    table: 'pmis_task',
    root: '.pmis-analysis',
    marker: '设备A',
    row: taskRow()
  }
] as const

for (const scenario of scenarios) {
  test(`${scenario.view} 日期草稿 B 不改写已接受 A 的标题与导出`, async ({ page }, testInfo) => {
    const pageErrors: string[] = []
    const unknownWrites: string[] = []
    const taskRequests: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', async (route) => {
      const request = route.request()
      const endpoint = new URL(request.url()).pathname.split('/').at(-1)
      if (request.method() !== 'GET') {
        unknownWrites.push(`${request.method()} ${endpoint}`)
        await route.fulfill({ status: 403, json: { message: 'Unexpected write' } })
        return
      }
      if (endpoint === scenario.table) {
        taskRequests.push(new URL(request.url()).search)
        await fulfillRows(route, scenario.row)
        return
      }
      await route.fulfill({
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
        json: []
      })
    })
    await page.goto(`/tests/e2e/fixtures/pmis-analysis-accepted-date.html?view=${scenario.view}`)
    await expect(
      page.locator(scenario.root).getByText(scenario.marker, { exact: true })
    ).toBeVisible()
    const draftCaption = await chooseDifferentDraftRange(page, scenario.root)
    await page.screenshot({
      path: testInfo.outputPath(`${scenario.view}-draft-before-export.png`),
      animations: 'disabled'
    })
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出分析', exact: true }).click()
    const download = await downloadPromise
    const workbookPath = testInfo.outputPath(`${scenario.view}-draft-export.xlsx`)
    await download.saveAs(workbookPath)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(workbookPath)
    const sheet = workbook.worksheets[0]
    const cells: string[] = []
    sheet.eachRow((row) => row.eachCell((cell) => cells.push(String(cell.value ?? ''))))
    const evidence = {
      acceptedCaption,
      draftCaption,
      headerCaption: (
        await page
          .locator(`${scenario.root} .business-workspace-header__tags .el-tag`)
          .first()
          .innerText()
      ).trim(),
      metricCaption: (
        await page
          .locator(`${scenario.root} .business-workspace-header__metric small`)
          .first()
          .innerText()
      ).trim(),
      sheetName: sheet.name,
      cells,
      taskRequests,
      unknownWrites,
      pageErrors
    }
    await writeFile(
      testInfo.outputPath(`${scenario.view}-draft-evidence.json`),
      `${JSON.stringify(evidence, null, 2)}\n`
    )
    await page.screenshot({
      path: testInfo.outputPath(`${scenario.view}-draft-after-export.png`),
      animations: 'disabled'
    })
    expect(evidence.draftCaption).not.toBe(acceptedCaption)
    expect(evidence.taskRequests).toHaveLength(1)
    expect(evidence.cells).toContain(scenario.marker)
    expect(evidence.sheetName).toBe(scenario.view === 'repair' ? acceptedCaption : '缺失统计')
    expect(evidence.headerCaption).toBe(acceptedCaption)
    expect(evidence.metricCaption).toBe(acceptedCaption)
    expect(evidence.unknownWrites).toEqual([])
    expect(evidence.pageErrors).toEqual([])
  })
}

for (const scenario of scenarios) {
  test(`${scenario.view} 在途 A 响应接受前编辑草稿 B 仍保留 A 上下文`, async ({
    page
  }, testInfo) => {
    const requests: string[] = []
    const pageErrors: string[] = []
    let releaseA!: () => void
    const heldA = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    let startedA!: () => void
    const requestA = new Promise<void>((resolve) => {
      startedA = resolve
    })
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', async (route) => {
      const request = route.request()
      if (new URL(request.url()).pathname.split('/').at(-1) === scenario.table) {
        requests.push(new URL(request.url()).search)
        startedA()
        await heldA
        await fulfillRows(route, scenario.row)
        return
      }
      await route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/pmis-analysis-accepted-date.html?view=${scenario.view}`, {
      waitUntil: 'domcontentloaded'
    })
    await requestA
    const draftCaption = await chooseDifferentDraftRange(page, scenario.root)
    releaseA()
    await expect(
      page.locator(scenario.root).getByText(scenario.marker, { exact: true })
    ).toBeVisible()
    const evidence = {
      acceptedCaption,
      draftCaption,
      headerCaption: (
        await page
          .locator(`${scenario.root} .business-workspace-header__tags .el-tag`)
          .first()
          .innerText()
      ).trim(),
      metricCaption: (
        await page
          .locator(`${scenario.root} .business-workspace-header__metric small`)
          .first()
          .innerText()
      ).trim(),
      requests,
      pageErrors
    }
    await writeFile(
      testInfo.outputPath(`${scenario.view}-inflight-draft.json`),
      `${JSON.stringify(evidence, null, 2)}\n`
    )
    await page.screenshot({
      path: testInfo.outputPath(`${scenario.view}-inflight-draft.png`),
      animations: 'disabled'
    })
    expect(evidence.draftCaption).not.toBe(acceptedCaption)
    expect(evidence.headerCaption).toBe(acceptedCaption)
    expect(evidence.metricCaption).toBe(acceptedCaption)
    expect(evidence.requests).toHaveLength(1)
    expect(evidence.pageErrors).toEqual([])
  })
}

for (const scenario of scenarios) {
  test(`${scenario.view} 570 深色 B 失败可重试、空结果与清空日期可辨`, async ({
    page
  }, testInfo) => {
    await page.setViewportSize({ width: 570, height: 900 })
    const pageErrors: string[] = []
    const unknownWrites: string[] = []
    const requests: string[] = []
    const nextMonth = dayjs().add(1, 'month').startOf('month')
    let bCalls = 0
    let bCallsAtError = 0
    let allowRecovery = false
    let releaseError!: () => void
    const heldError = new Promise<void>((resolve) => {
      releaseError = resolve
    })
    let startedError!: () => void
    const errorRequest = new Promise<void>((resolve) => {
      startedError = resolve
    })
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', async (route) => {
      const request = route.request()
      const endpoint = new URL(request.url()).pathname.split('/').at(-1)
      if (request.method() !== 'GET') {
        unknownWrites.push(`${request.method()} ${endpoint}`)
        await route.fulfill({ status: 403, json: { message: 'Unexpected write' } })
        return
      }
      if (endpoint === scenario.table) {
        const search = new URL(request.url()).search
        requests.push(search)
        if (search.includes(nextMonth.format('YYYY-MM-DD'))) {
          bCalls++
          if (!allowRecovery) {
            if (bCalls === 1) startedError()
            await heldError
            await route.fulfill({
              status: 503,
              json: { code: 'temporary_unavailable', message: 'select * from private_table' }
            })
            return
          }
          if (bCalls === bCallsAtError + 1) {
            await fulfillRows(
              route,
              scenario.view === 'repair' ? repairRow('B', nextMonth) : taskRow('B', nextMonth)
            )
            return
          }
        }
        if (requests.length === 1) await fulfillRows(route, scenario.row)
        else
          await route.fulfill({
            headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
            json: []
          })
        return
      }
      await route.fulfill({ json: [] })
    })
    await page.goto(
      `/tests/e2e/fixtures/pmis-analysis-accepted-date.html?view=${scenario.view}&theme=dark`
    )
    await expect(
      page.locator(scenario.root).getByText(scenario.marker, { exact: true })
    ).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() => ({
          dark: document.documentElement.classList.contains('dark'),
          colorScheme: getComputedStyle(document.documentElement).colorScheme
        }))
      )
      .toEqual({ dark: true, colorScheme: 'dark' })
    const draftCaption = await chooseDifferentDraftRange(page, scenario.root)
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await errorRequest
    const metricValues = page.locator(`${scenario.root} .business-workspace-header__metric strong`)
    const cardTags = page.locator(`${scenario.root}__grid .el-tag`)
    const exportButton = page.getByRole('button', { name: '导出分析', exact: true })
    await expect(metricValues).toHaveText(['—', '—', '—', '—'])
    await expect(cardTags).toHaveText(
      scenario.view === 'repair' ? ['— 名人员', '逾期 —'] : ['— 个范围', '— 个对象']
    )
    await expect(exportButton).toBeDisabled()
    releaseError()
    await expect(page.getByRole('button', { name: '重新加载' }).first()).toBeVisible()
    await expect(metricValues).toHaveText(['—', '—', '—', '—'])
    await expect(cardTags).toHaveText(
      scenario.view === 'repair' ? ['— 名人员', '逾期 —'] : ['— 个范围', '— 个对象']
    )
    await expect(exportButton).toBeDisabled()
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('select * from private_table')
    await page.screenshot({
      path: testInfo.outputPath(`${scenario.view}-error-dark-570.png`),
      animations: 'disabled'
    })
    bCallsAtError = bCalls
    allowRecovery = true
    await page.getByRole('button', { name: '重新加载' }).first().click()
    await expect(
      page.locator(scenario.root).getByText(scenario.view === 'repair' ? '维修员B' : '设备B', {
        exact: true
      })
    ).toBeVisible()
    await expect(metricValues.first()).toHaveText('1')
    await expect(cardTags).toHaveText(
      scenario.view === 'repair' ? ['1 名人员', '暂无逾期'] : ['1 个范围', '1 个对象']
    )
    await expect(exportButton).toBeEnabled()
    await page.screenshot({
      path: testInfo.outputPath(`${scenario.view}-ready-dark-570.png`),
      animations: 'disabled'
    })
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(metricValues).toHaveText(['0', '0', '0', '0'])
    await expect(cardTags).toHaveText(
      scenario.view === 'repair' ? ['0 名人员', '暂无逾期'] : ['0 个范围', '0 个对象']
    )
    await expect(exportButton).toBeEnabled()
    const downloads: string[] = []
    page.on('download', (download) => downloads.push(download.suggestedFilename()))
    await exportButton.click()
    await expect(page.getByText('没有可导出的数据', { exact: true })).toBeVisible()
    const dateEditor = page.locator(`${scenario.root} .art-search-bar .el-date-editor`)
    await dateEditor.hover()
    await dateEditor.locator('.el-range__close-icon').click()
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(metricValues).toHaveText(['0', '0', '0', '0'])
    const evidence = {
      draftCaption,
      headerCaption: (
        await page
          .locator(`${scenario.root} .business-workspace-header__tags .el-tag`)
          .first()
          .innerText()
      ).trim(),
      requests,
      bCalls,
      bCallsAtError,
      downloads,
      unknownWrites,
      pageErrors,
      overflow: await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    }
    await writeFile(
      testInfo.outputPath(`${scenario.view}-error-empty-clear.json`),
      `${JSON.stringify(evidence, null, 2)}\n`
    )
    expect(evidence.headerCaption).toBe('不限 至 不限')
    expect(evidence.bCallsAtError).toBeGreaterThanOrEqual(1)
    expect(evidence.bCalls).toBe(evidence.bCallsAtError + 2)
    expect(evidence.requests).toHaveLength(evidence.bCalls + 2)
    expect(evidence.downloads).toEqual([])
    expect(evidence.unknownWrites).toEqual([])
    expect(evidence.pageErrors).toEqual([])
    expect(evidence.overflow).toBeLessThanOrEqual(1)
  })
}

for (const scenario of scenarios) {
  for (const context of ['tenant', 'user'] as const) {
    test(`${scenario.view} 缓存页离开后 ${context} 切换仅回页读取 B`, async ({
      page
    }, testInfo) => {
      const requests: string[] = []
      const unknownWrites: string[] = []
      const pageErrors: string[] = []
      let releaseA!: () => void
      const heldA = new Promise<void>((resolve) => {
        releaseA = resolve
      })
      let startedA!: () => void
      const requestA = new Promise<void>((resolve) => {
        startedA = resolve
      })
      page.on('pageerror', (error) => pageErrors.push(error.message))
      await prepareIsolatedSession(page)
      await page.route('**/rest/v1/**', async (route) => {
        const request = route.request()
        const endpoint = new URL(request.url()).pathname.split('/').at(-1)
        if (request.method() !== 'GET') {
          unknownWrites.push(`${request.method()} ${endpoint}`)
          await route.fulfill({ status: 403, json: { message: 'Unexpected write' } })
          return
        }
        if (endpoint === scenario.table) {
          const tenantFilter = new URL(request.url()).searchParams.get('tenant_id') ?? ''
          requests.push(tenantFilter)
          if (requests.length === 1) {
            startedA()
            await heldA
            try {
              await fulfillRows(route, scenario.row)
            } catch {
              // Leaving the cached route may abort its original network request.
            }
            return
          }
          await fulfillRows(route, scenario.view === 'repair' ? repairRow('B') : taskRow('B'))
          return
        }
        await route.fulfill({ json: [] })
      })
      await page.goto(
        `/tests/e2e/fixtures/pmis-analysis-accepted-date.html?view=${scenario.view}&lifecycle=1${context === 'user' ? '&identity=ordinary' : ''}`,
        { waitUntil: 'domcontentloaded' }
      )
      await requestA
      expect(requests).toHaveLength(1)
      await page.getByRole('button', { name: '离开工作区', exact: true }).click()
      await expect(page.getByText('已离开分析工作区', { exact: true })).toBeVisible()
      await page
        .getByRole('button', {
          name: context === 'tenant' ? '切换租户 B' : '切换用户 B',
          exact: true
        })
        .click()
      releaseA()
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      )
      expect(requests).toHaveLength(1)
      await page.getByRole('button', { name: '返回工作区', exact: true }).click()
      await expect(
        page.locator(scenario.root).getByText(scenario.view === 'repair' ? '维修员B' : '设备B', {
          exact: true
        })
      ).toBeVisible()
      const evidence = {
        context,
        requests,
        oldVisible: await page
          .locator(scenario.root)
          .getByText(scenario.marker, { exact: true })
          .count(),
        pageErrors,
        unknownWrites
      }
      await writeFile(
        testInfo.outputPath(`${scenario.view}-${context}-cached-context.json`),
        `${JSON.stringify(evidence, null, 2)}\n`
      )
      await page.screenshot({
        path: testInfo.outputPath(`${scenario.view}-${context}-cached-context.png`),
        animations: 'disabled'
      })
      expect(evidence.requests).toHaveLength(2)
      expect(evidence.oldVisible).toBe(0)
      if (context === 'tenant') {
        expect(evidence.requests[0]).toContain('11111111-1111-4111-8111-111111111111')
        expect(evidence.requests[1]).toContain('22222222-2222-4222-8222-222222222222')
      } else {
        expect(evidence.requests[0]).toBe(evidence.requests[1])
      }
      expect(evidence.pageErrors).toEqual([])
      expect(evidence.unknownWrites).toEqual([])
    })
  }
}

test('repair 多维修人、未派工与逾期并列排序和 Excel 汇总一致', async ({ page }, testInfo) => {
  const repairer = (id: string, name: string) => ({
    id,
    employee_no: `EMP-${id}`,
    employee_name: name
  })
  const alpha = repairer('A', '维修员甲')
  const beta = repairer('B', '维修员乙')
  const gamma = repairer('C', '维修员丙')
  const overdueAt = dayjs().subtract(2, 'day').toISOString()
  const rows = [
    { ...repairRow('A1'), repairer: alpha, required_complete_at: overdueAt },
    { ...repairRow('B1'), repairer: beta },
    { ...repairRow('A2'), repairer: alpha, status: 'completed' },
    { ...repairRow('U1'), repairer: null },
    { ...repairRow('B2'), repairer: beta },
    { ...repairRow('U2'), repairer: null },
    { ...repairRow('B3'), repairer: beta },
    { ...repairRow('C1'), repairer: gamma, required_complete_at: overdueAt }
  ]
  const unknownWrites: string[] = []
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const endpoint = new URL(request.url()).pathname.split('/').at(-1)
    if (request.method() !== 'GET') {
      unknownWrites.push(`${request.method()} ${endpoint}`)
      await route.fulfill({ status: 403, json: { message: 'Unexpected write' } })
      return
    }
    if (endpoint === 'pmis_repair_task') {
      await route.fulfill({
        headers: { 'content-range': '0-7/8', 'access-control-expose-headers': 'content-range' },
        json: rows
      })
      return
    }
    await route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/pmis-analysis-accepted-date.html?view=repair')
  const ranking = page.locator(
    '.pmis-repair-analysis__ranking article .pmis-repair-analysis__identity strong'
  )
  await expect(ranking).toHaveCount(4)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出分析', exact: true }).click()
  const path = testInfo.outputPath('repair-grouping.xlsx')
  await (await downloadPromise).saveAs(path)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path)
  const sheet = workbook.worksheets[0]
  const summary = [2, 3, 4, 5].map((index) => ({
    name: sheet.getCell(`B${index}`).value,
    total: sheet.getCell(`C${index}`).value,
    completed: sheet.getCell(`D${index}`).value,
    overdue: sheet.getCell(`E${index}`).value,
    rate: sheet.getCell(`F${index}`).value
  }))
  const evidence = {
    ranking: await ranking.allInnerTexts(),
    summary,
    sheetName: sheet.name,
    unknownWrites,
    pageErrors
  }
  await writeFile(
    testInfo.outputPath('repair-grouping.json'),
    `${JSON.stringify(evidence, null, 2)}\n`
  )
  await page.screenshot({
    path: testInfo.outputPath('repair-grouping.png'),
    animations: 'disabled'
  })
  expect(evidence.ranking).toEqual(['维修员乙', '维修员甲', '未派工', '维修员丙'])
  expect(evidence.summary).toEqual([
    { name: '维修员乙', total: '3', completed: '0', overdue: '0', rate: '0%' },
    { name: '维修员甲', total: '2', completed: '1', overdue: '1', rate: '50%' },
    { name: '未派工', total: '2', completed: '0', overdue: '0', rate: '0%' },
    { name: '维修员丙', total: '1', completed: '0', overdue: '1', rate: '0%' }
  ])
  expect(evidence.sheetName).toBe(acceptedCaption)
  expect(evidence.unknownWrites).toEqual([])
  expect(evidence.pageErrors).toEqual([])
})
