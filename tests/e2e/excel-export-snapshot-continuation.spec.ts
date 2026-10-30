import { readFile, writeFile } from 'node:fs/promises'
import { expect, test, type Download, type Page, type TestInfo } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)
const fixture =
  process.env.E2E_EXCEL_EXPORT_FIXTURE ||
  '/tests/e2e/fixtures/excel-export-snapshot-continuation.html'
const engineAssetUrl = process.env.E2E_SHEETJS_ASSET_URL
const isEngineAsset = (url: URL): boolean =>
  engineAssetUrl ? url.href === engineAssetUrl : /xlsx\.mjs(?:\?|$)/.test(url.href)

interface ProbeState {
  route: string
  userId: string
  tenantId: string
  platformActive: boolean
  filename: string
  rowCount: number
  progress: number[]
  success: Array<{ filename: string; rowCount: number }>
  errors: Array<{ code: string; message: string }>
  exporting: boolean | null
}

const readState = async (page: Page): Promise<ProbeState> =>
  JSON.parse(await page.locator('#excel-export-state').innerText()) as ProbeState

const readDownloadedNames = async (path: string): Promise<string[]> => {
  const XLSX = await import('../../src/vendor/sheetjs/xlsx.mjs')
  const workbook = XLSX.read(await readFile(path), { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json<{ 名称: string }>(sheet).map((row) => row.名称)
}

const saveActualExport = async (
  page: Page,
  download: Download,
  testInfo: TestInfo,
  name: string
) => {
  const path = testInfo.outputPath(`${name}.xlsx`)
  await download.saveAs(path)
  const actual = {
    suggestedFilename: download.suggestedFilename(),
    names: await readDownloadedNames(path),
    state: await readState(page),
    toasts: await page.locator('.el-message').allInnerTexts()
  }
  await writeFile(testInfo.outputPath(`${name}.json`), `${JSON.stringify(actual, null, 2)}\n`)
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: 'disabled' })
  return actual
}

const openProbe = async (page: Page, mode: string): Promise<string[]> => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await prepareIsolatedSession(page)
  await page.goto(`${fixture}?mode=${mode}`)
  await expect(page.getByRole('button', { name: '导出测试表', exact: true })).toBeVisible()
  return pageErrors
}

const expectNoStaleContinuation = async (
  page: Page,
  downloads: string[],
  testInfo: TestInfo,
  name: string
): Promise<void> => {
  // Keep the public expose handle after route unmount; final progress may be suppressed.
  await expect.poll(async () => (await readState(page)).exporting).toBe(false)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  const state = await readState(page)
  const toasts = await page.locator('.el-message').allInnerTexts()
  await writeFile(
    testInfo.outputPath(`${name}.json`),
    `${JSON.stringify({ state, downloads, toasts }, null, 2)}\n`
  )
  expect(downloads).toEqual([])
  expect(state.success).toEqual([])
  expect(state.errors).toEqual([])
  expect(toasts).toEqual([])
}

test('替换导出 props 后，文件与成功信息仍描述点击时的 A 两行', async ({ page }, testInfo) => {
  const pageErrors = await openProbe(page, 'replace-props')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出测试表', exact: true }).click()
  const download = await downloadPromise
  await expect.poll(async () => (await readState(page)).progress.at(-1)).toBe(0)
  const actual = await saveActualExport(page, download, testInfo, 'props-replaced')
  expect(actual.toasts).toContain('成功导出 2 条数据')
  expect(actual.suggestedFilename).toMatch(/^snapshot-A_.*\.xlsx$/)
  expect(actual.names).toEqual(['A-1', 'A-2'])
  const state = actual.state
  expect(state.filename).toBe('snapshot-B')
  expect(state.rowCount).toBe(5)
  expect(state.success).toEqual([{ filename: 'snapshot-A', rowCount: 2 }])
  expect(pageErrors).toEqual([])
})

test('原数组和单元格在异步阶段变更，文件仍是点击时的字符串快照', async ({ page }, testInfo) => {
  const pageErrors = await openProbe(page, 'mutate-rows')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出测试表', exact: true }).click()
  const download = await downloadPromise
  await expect.poll(async () => (await readState(page)).progress.at(-1)).toBe(0)
  const actual = await saveActualExport(page, download, testInfo, 'rows-mutated')
  expect(actual.toasts).toContain('成功导出 2 条数据')
  expect(actual.suggestedFilename).toMatch(/^snapshot-A_.*\.xlsx$/)
  expect(actual.names).toEqual(['A-1', 'A-2'])
  expect(actual.state.success).toEqual([{ filename: 'snapshot-A', rowCount: 2 }])
  expect(pageErrors).toEqual([])
})

test('普通身份 A 变为 B 时，不下载或向旧导出报成功错误', async ({ page }, testInfo) => {
  const pageErrors = await openProbe(page, 'change-user')
  expect(await readState(page)).toMatchObject({
    userId: 'user-A',
    tenantId: '11111111-1111-4111-8111-111111111111',
    platformActive: false
  })
  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await page.getByRole('button', { name: '导出测试表', exact: true }).click()
  await expect.poll(async () => (await readState(page)).userId).toBe('user-B')
  await expect.poll(async () => (await readState(page)).progress.includes(95)).toBe(true)
  await expect(page.getByRole('button', { name: '导出测试表', exact: true })).toBeEnabled()
  expect(await readState(page)).toMatchObject({
    userId: 'user-B',
    tenantId: '11111111-1111-4111-8111-111111111111',
    platformActive: false
  })
  await expectNoStaleContinuation(page, downloads, testInfo, 'user-changed')
  expect(pageErrors).toEqual([])
})

test('工作簿模块加载期间离开路由，不下载或留下旧导出反馈', async ({ page }, testInfo) => {
  let releaseImport!: () => void
  const importGate = new Promise<void>((resolve) => {
    releaseImport = resolve
  })
  let importStarted!: () => void
  const started = new Promise<void>((resolve) => {
    importStarted = resolve
  })
  await page.route(isEngineAsset, async (route) => {
    importStarted()
    await importGate
    await route.continue()
  })
  const pageErrors = await openProbe(page, 'change-route')
  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await page.getByRole('button', { name: '导出测试表', exact: true }).click()
  await started
  await page.getByRole('button', { name: '切换路由', exact: true }).click()
  await expect.poll(async () => (await readState(page)).route).toBe('/other')
  const importResponse = page.waitForResponse((response) => isEngineAsset(new URL(response.url())))
  releaseImport()
  await importResponse
  await expectNoStaleContinuation(page, downloads, testInfo, 'route-changed')
  expect(pageErrors).toEqual([])
})
