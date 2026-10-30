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
  successes: Array<{
    fileName: string
    uploadName: string
    rows: Array<Record<string, unknown>>
  }>
  errors: string[]
}

const readState = async (page: Page): Promise<ImportState> =>
  JSON.parse(await page.locator('#excel-import-state').innerText()) as ImportState

const xlsxBuffer = async (): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('导入')
  sheet.addRow(columns)
  sheet.addRow([...values])
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
  let releaseImport!: () => void
  const heldImport = new Promise<void>((resolve) => {
    releaseImport = resolve
  })
  let startedImport!: () => void
  const requestedImport = new Promise<void>((resolve) => {
    startedImport = resolve
  })
  await page.route(isEngineAsset, async (route) => {
    startedImport()
    await heldImport
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
  await requestedImport
  await page.getByRole('button', { name: '切换上下文', exact: true }).click()
  await expect.poll(async () => (await readState(page)).contextKey).toBe('context-B')
  const response = page.waitForResponse((item) => isEngineAsset(new URL(item.url())))
  releaseImport()
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
