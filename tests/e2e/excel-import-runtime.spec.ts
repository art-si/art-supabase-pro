import { writeFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

const fixture =
  process.env.E2E_EXCEL_IMPORT_FIXTURE || '/tests/e2e/fixtures/excel-import-runtime.html'
const engineAssetUrl = process.env.E2E_SHEETJS_ASSET_URL
const isEngineAsset = (url: URL): boolean =>
  engineAssetUrl ? url.href === engineAssetUrl : /xlsx\.mjs(?:\?|$)/.test(url.href)
const columns = ['名称', '备注', '数量']
const values = ['华北,一区', '中文,说明', 0] as const
const expectedRow = { 名称: values[0], 备注: values[1], 数量: values[2] }

interface ImportState {
  contextKey: string
  parsing: boolean
  parsingChanges: boolean[]
  fileChanges: string[]
  reentryFired: boolean
  inputValueAtReentry: string | null
  mounted: boolean
  activated: boolean
  route: string
  tenantId: string | null
  tenantRevision: number
  userId: string
  actorTenantId: string
  platformSuper: boolean
  successes: Array<{
    fileName: string
    uploadName: string
    rows: Array<Record<string, unknown>>
  }>
  errors: string[]
}

const readState = async (page: Page): Promise<ImportState> =>
  JSON.parse(await page.locator('#excel-import-state').innerText()) as ImportState

const trackWorkbookReads = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer
    File.prototype.arrayBuffer = function () {
      return read.call(this).then((buffer) => {
        const names = JSON.parse(document.body.dataset.workbookReadNames ?? '[]') as string[]
        names.push(this.name)
        document.body.dataset.workbookReadNames = JSON.stringify(names)
        document.body.dataset.workbookReads = String(
          Number(document.body.dataset.workbookReads ?? 0) + 1
        )
        return buffer
      })
    }
  })
}

const waitForWorkbookReads = async (page: Page, count: number): Promise<void> => {
  await expect
    .poll(async () => page.locator('body').getAttribute('data-workbook-reads'))
    .toBe(String(count))
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
}

const xlsxBuffer = async (row: readonly (string | number)[] = values): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('导入')
  sheet.addRow(columns)
  sheet.addRow([...row])
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

const xlsBuffer = async (): Promise<Buffer> => {
  const XLSX = await import('../../src/vendor/sheetjs/xlsx.mjs')
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([columns, [...values]]), '导入')
  return Buffer.from(XLSX.write(workbook, { bookType: 'xls', type: 'array' }))
}

for (const format of ['csv', 'xls', 'xlsx'] as const) {
  test(`真实 ArtExcelImport 解析 ${format.toUpperCase()} 中文逗号与数值零`, async ({
    page
  }, testInfo) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await prepareIsolatedSession(page)
    await page.goto(fixture)
    const name = `中文导入.${format === 'csv' ? 'CSV' : format}`
    const buffer =
      format === 'csv'
        ? Buffer.from(`\uFEFF名称,备注,数量\n"${values[0]}","${values[1]}",0\n`, 'utf8')
        : format === 'xls'
          ? await xlsBuffer()
          : await xlsxBuffer()
    await page.locator('input[type="file"]').setInputFiles({
      name,
      mimeType:
        format === 'csv'
          ? 'text/csv'
          : format === 'xls'
            ? 'application/vnd.ms-excel'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer
    })
    await expect.poll(async () => (await readState(page)).successes.length).toBe(1)
    await expect.poll(async () => (await readState(page)).parsing).toBe(false)
    const state = await readState(page)
    await writeFile(
      testInfo.outputPath(`${format}-actual.json`),
      `${JSON.stringify({ state, pageErrors }, null, 2)}\n`
    )
    await page.screenshot({
      path: testInfo.outputPath(`${format}-import.png`),
      animations: 'disabled'
    })
    expect(state.successes).toEqual([{ fileName: name, uploadName: name, rows: [expectedRow] }])
    expect(state.errors).toEqual([])
    expect(pageErrors).toEqual([])
  })
}

test('导入中切换 contextKey 丢弃旧解析并可重新选择真实工作簿', async ({ page }, testInfo) => {
  const heldImport = Promise.withResolvers<void>()
  const requestedImport = Promise.withResolvers<void>()
  await page.route(isEngineAsset, async (route) => {
    requestedImport.resolve()
    await heldImport.promise
    await route.continue()
  })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await prepareIsolatedSession(page)
  await page.goto(fixture)
  const buffer = await xlsxBuffer()
  await page.locator('input[type="file"]').setInputFiles({
    name: '上下文.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer
  })
  await requestedImport.promise
  await page.getByRole('button', { name: '切换上下文', exact: true }).click()
  await expect.poll(async () => (await readState(page)).contextKey).toBe('context-B')
  await expect(page.getByRole('button', { name: '导入 Excel' })).toBeEnabled()
  await expect.poll(async () => (await readState(page)).parsingChanges).toEqual([true, false])
  const response = page.waitForResponse((item) => isEngineAsset(new URL(item.url())))
  heldImport.resolve()
  await response
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  const staleState = await readState(page)
  await writeFile(
    testInfo.outputPath('stale-context-actual.json'),
    `${JSON.stringify({ staleState, pageErrors }, null, 2)}\n`
  )
  expect(staleState).toMatchObject({
    contextKey: 'context-B',
    parsing: false,
    successes: [],
    errors: []
  })
  await page.locator('input[type="file"]').setInputFiles({
    name: '上下文.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer
  })
  await expect.poll(async () => (await readState(page)).successes.length).toBe(1)
  const state = await readState(page)
  await writeFile(
    testInfo.outputPath('retry-context-actual.json'),
    `${JSON.stringify(state, null, 2)}\n`
  )
  expect(state.successes[0]?.rows).toEqual([expectedRow])
  expect(state.errors).toEqual([])
  expect(pageErrors).toEqual([])
})

const contextChanges = [
  {
    name: '租户',
    button: '切换租户',
    field: 'tenantId',
    expected: '22222222-2222-4222-8222-222222222222'
  },
  { name: '租户版本', button: '更新租户版本', field: 'tenantRevision', expected: 1 },
  { name: '用户', button: '切换用户', field: 'userId', expected: 'import-test-user-B' },
  {
    name: '认证租户',
    button: '切换认证租户',
    field: 'actorTenantId',
    expected: '22222222-2222-4222-8222-222222222222'
  },
  { name: '平台身份', button: '撤销平台身份', field: 'platformSuper', expected: false },
  { name: '路由', button: '切换路由', field: 'route', expected: '/another' }
] as const

for (const change of contextChanges) {
  test(`真实 XLSX 解析期间切换${change.name}立即解锁，新文件覆盖旧文件`, async ({ page }) => {
    const heldImport = Promise.withResolvers<void>()
    const requestedImport = Promise.withResolvers<void>()
    await page.route(isEngineAsset, async (route) => {
      requestedImport.resolve()
      await heldImport.promise
      await route.continue()
    })
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await prepareIsolatedSession(page)
    await page.goto(fixture)
    await trackWorkbookReads(page)
    const engineResponse = page.waitForResponse((item) => isEngineAsset(new URL(item.url())))
    const oldBuffer = await xlsxBuffer(['旧租户 A', '旧文件', 1])
    const newBuffer = await xlsxBuffer(['新上下文 B', '新文件', 2])
    try {
      await page.locator('input[type="file"]').setInputFiles({
        name: '旧文件.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: oldBuffer
      })
      await requestedImport.promise
      await expect.poll(async () => (await readState(page)).parsing).toBe(true)
      await page.getByRole('button', { name: change.button, exact: true }).click()
      await expect.poll(async () => (await readState(page))[change.field]).toBe(change.expected)
      await expect.poll(async () => (await readState(page)).parsingChanges).toEqual([true, false])
      await expect(page.getByRole('button', { name: '导入 Excel' })).toBeEnabled()
      await page.locator('input[type="file"]').setInputFiles({
        name: '新文件.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: newBuffer
      })
      await expect
        .poll(async () => (await readState(page)).parsingChanges)
        .toEqual([true, false, true])
    } finally {
      heldImport.resolve()
    }
    await engineResponse
    await waitForWorkbookReads(page, 2)
    await expect.poll(async () => (await readState(page)).successes.length).toBe(1)
    await expect.poll(async () => (await readState(page)).parsing).toBe(false)
    const state = await readState(page)
    expect(state.successes).toEqual([
      {
        fileName: '新文件.xlsx',
        uploadName: '新文件.xlsx',
        rows: [{ 名称: '新上下文 B', 备注: '新文件', 数量: 2 }]
      }
    ])
    expect(state.parsingChanges).toEqual([true, false, true, false])
    expect(state.errors).toEqual([])
    expect(pageErrors).toEqual([])
  })
}

test('parsing-change(true) 同步回入切租户，仍可立刻重选实际输入框', async ({ page }) => {
  const heldImport = Promise.withResolvers<void>()
  await page.route(isEngineAsset, async (route) => {
    await heldImport.promise
    await route.continue()
  })
  await prepareIsolatedSession(page)
  await page.goto(fixture)
  await trackWorkbookReads(page)
  const engineResponse = page.waitForResponse((item) => isEngineAsset(new URL(item.url())))
  await page.getByRole('button', { name: '解析开始回入切租户', exact: true }).click()
  try {
    await page.locator('input[type="file"]').setInputFiles({
      name: '旧回入.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: await xlsxBuffer(['旧回入 A', '旧文件', 1])
    })
    await expect.poll(async () => (await readState(page)).reentryFired).toBe(true)
    await expect
      .poll(async () => (await readState(page)).tenantId)
      .toBe('22222222-2222-4222-8222-222222222222')
    await expect.poll(async () => (await readState(page)).parsingChanges).toEqual([true, false])
    await expect(page.getByRole('button', { name: '导入 Excel' })).toBeEnabled()
    await expect(page.locator('input[type="file"]')).toHaveValue('')
    await page.locator('input[type="file"]').setInputFiles({
      name: '新回入.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: await xlsxBuffer(['新回入 B', '新文件', 2])
    })
  } finally {
    heldImport.resolve()
  }
  await engineResponse
  await waitForWorkbookReads(page, 1)
  await expect.poll(async () => (await readState(page)).successes.length).toBe(1)
  const state = await readState(page)
  expect(await page.locator('body').getAttribute('data-workbook-read-names')).toBe(
    '["新回入.xlsx"]'
  )
  expect(state.successes[0]?.rows).toEqual([{ 名称: '新回入 B', 备注: '新文件', 数量: 2 }])
  expect(state.parsingChanges).toEqual([true, false, true, false])
  expect(state.errors).toEqual([])
})

test('parsing-change(false) 同步回入切租户，旧解析返回后只接收重选文件', async ({ page }) => {
  const heldImport = Promise.withResolvers<void>()
  const requestedImport = Promise.withResolvers<void>()
  await page.route(isEngineAsset, async (route) => {
    requestedImport.resolve()
    await heldImport.promise
    await route.continue()
  })
  await prepareIsolatedSession(page)
  await page.goto(fixture)
  await trackWorkbookReads(page)
  const engineResponse = page.waitForResponse((item) => isEngineAsset(new URL(item.url())))
  await page.getByRole('button', { name: '解析结束回入切租户', exact: true }).click()
  try {
    await page.locator('input[type="file"]').setInputFiles({
      name: '回入.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: await xlsxBuffer(['旧回入 A', '旧文件', 1])
    })
    await requestedImport.promise
    await page.getByRole('button', { name: '切换上下文', exact: true }).click()
    await expect.poll(async () => (await readState(page)).reentryFired).toBe(true)
    await expect
      .poll(async () => (await readState(page)).tenantId)
      .toBe('22222222-2222-4222-8222-222222222222')
    expect((await readState(page)).inputValueAtReentry).toBe('')
    await expect.poll(async () => (await readState(page)).parsingChanges).toEqual([true, false])
    await expect(page.getByRole('button', { name: '导入 Excel' })).toBeEnabled()
    await expect(page.locator('input[type="file"]')).toHaveValue('')
    await page.locator('input[type="file"]').setInputFiles({
      name: '回入.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: await xlsxBuffer(['新回入 B', '新文件', 2])
    })
  } finally {
    heldImport.resolve()
  }
  await engineResponse
  await waitForWorkbookReads(page, 2)
  await expect.poll(async () => (await readState(page)).successes.length).toBe(1)
  const state = await readState(page)
  expect(state.successes[0]?.rows).toEqual([{ 名称: '新回入 B', 备注: '新文件', 数量: 2 }])
  expect(state.parsingChanges).toEqual([true, false, true, false])
  expect(state.errors).toEqual([])
})

for (const lifecycle of ['停用组件', '卸载组件'] as const) {
  test(`真实 XLSX 解析期间${lifecycle}，旧结果不回写父级`, async ({ page }) => {
    const heldImport = Promise.withResolvers<void>()
    const requestedImport = Promise.withResolvers<void>()
    await page.route(isEngineAsset, async (route) => {
      requestedImport.resolve()
      await heldImport.promise
      await route.continue()
    })
    await prepareIsolatedSession(page)
    await page.goto(fixture)
    await trackWorkbookReads(page)
    const engineResponse = page.waitForResponse((item) => isEngineAsset(new URL(item.url())))
    try {
      await page.locator('input[type="file"]').setInputFiles({
        name: '生命周期.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: await xlsxBuffer()
      })
      await requestedImport.promise
      await page.getByRole('button', { name: lifecycle, exact: true }).click()
      await expect.poll(async () => (await readState(page)).parsing).toBe(false)
    } finally {
      heldImport.resolve()
    }
    await engineResponse
    await waitForWorkbookReads(page, 1)
    const state = await readState(page)
    expect(state.parsingChanges).toEqual([true, false])
    expect(state.successes).toEqual([])
    expect(state.errors).toEqual([])
  })
}

test('parseExcel=false 只同步回报文件变化与 true/false 解析状态', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.goto(fixture)
  await page.getByRole('button', { name: '关闭解析', exact: true }).click()
  await page.locator('input[type="file"]').setInputFiles({
    name: '仅传文件.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await xlsxBuffer()
  })
  await expect.poll(async () => (await readState(page)).fileChanges).toEqual(['仅传文件.xlsx'])
  const state = await readState(page)
  expect(state.parsingChanges).toEqual([true, false])
  expect(state.parsing).toBe(false)
  expect(state.successes).toEqual([])
  expect(state.errors).toEqual([])
})

test('真实组件读取工作簿失败后结束解析，并允许原文件重试', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.goto(fixture)
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer
    let failOnce = true
    File.prototype.arrayBuffer = function () {
      if (failOnce) {
        failOnce = false
        return Promise.reject(new Error('读取工作簿失败'))
      }
      return read.call(this)
    }
  })
  const buffer = await xlsxBuffer()
  const file = {
    name: '可重试.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer
  }
  await page.locator('input[type="file"]').setInputFiles(file)
  await expect.poll(async () => (await readState(page)).errors).toEqual(['读取工作簿失败'])
  await expect(page.getByRole('button', { name: '导入 Excel' })).toBeEnabled()
  await page.locator('input[type="file"]').setInputFiles(file)
  await expect.poll(async () => (await readState(page)).successes.length).toBe(1)
  const state = await readState(page)
  expect(state.successes[0]?.rows).toEqual([expectedRow])
  expect(state.parsingChanges).toEqual([true, false, true, false])
  expect(state.errors).toEqual(['读取工作簿失败'])
})
