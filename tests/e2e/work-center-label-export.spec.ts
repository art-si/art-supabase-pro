import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('工作中心 Excel 标签保留二维码 PNG 和行列尺寸', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/production-identity-options.html?mode=qr', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开二维码', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '工作中心二维码 · 2 个', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('canvas')).toHaveCount(2)
  const images = await dialog.locator('canvas').evaluateAll((elements) =>
    elements.map((element) => {
      if (!(element instanceof HTMLCanvasElement)) throw new Error('二维码画布未挂载')
      return element.toDataURL('image/png').split(',')[1]
    })
  )
  const downloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: '下载 Excel 标签', exact: true }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('工作中心二维码.xlsx')
  const file = await download.path()
  if (!file) throw new Error('Excel 标签未生成')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(file)
  const sheet = workbook.getWorksheet('工作中心二维码')
  if (!sheet) throw new Error('工作中心工作表缺失')
  expect(sheet.getRow(2).values).toEqual([undefined, 'WC-001', '测试工作中心 1'])
  expect(sheet.getRow(3).values).toEqual([undefined, 'WC-002', '测试工作中心 2'])
  expect(sheet.getRow(2).height).toBe(122)
  expect(sheet.getColumn(3).width).toBe(26)
  const embedded = sheet.getImages()
  expect(embedded).toHaveLength(2)
  embedded.forEach((entry, index) => {
    const image = workbook.getImage(Number(entry.imageId))
    expect(image.extension).toBe('png')
    if (!Buffer.isBuffer(image.buffer)) throw new Error('Excel 未嵌入二维码 PNG')
    expect(image.buffer.equals(Buffer.from(images[index], 'base64'))).toBe(true)
  })
  expect(errors).toEqual([])
})

test('切换租户后丢弃旧工作中心响应并关闭已打开的二维码', async ({ page }) => {
  await prepareIsolatedSession(page)
  const tenantIds = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']
  await page.route('**/rest/v1/sys_tenant?*', (route) =>
    route.fulfill({
      json: tenantIds.map((id, index) => ({
        id,
        tenant_code: `tenant-${index}`,
        tenant_name: `测试租户 ${index + 1}`
      }))
    })
  )
  const pending = Promise.withResolvers<void>()
  let delayAllTenantsExport = true
  const isExport = (url: URL) =>
    url.pathname.endsWith('/mdm_work_center') && url.searchParams.get('limit') === '1000'
  await page.route('**/rest/v1/mdm_work_center?*', async (route) => {
    const url = new URL(route.request().url())
    const selected = url.searchParams.get('tenant_id') === `eq.${tenantIds[1]}`
    if (isExport(url) && !selected && delayAllTenantsExport) await pending.promise
    await route.fulfill({
      json: [
        {
          id: selected ? 'selected-center' : 'old-center',
          tenant_id: selected ? tenantIds[1] : tenantIds[0],
          code: selected ? 'WC-SELECTED' : 'WC-OLD',
          name: selected ? '目标租户中心' : '原租户中心',
          qr_token: selected ? 'selected-token' : 'old-token',
          personnel_mode: '指定人数',
          person_ids: [],
          policy: {}
        }
      ],
      headers: { 'content-range': '0-0/1' }
    })
  })
  await page.goto('/tests/e2e/fixtures/production-identity-options.html?mode=work-center-scope', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByText('原租户中心', { exact: true })).toBeVisible()
  const action = page.getByRole('button', { name: '导出二维码', exact: true })
  const staleRequest = page.waitForRequest((request) => isExport(new URL(request.url())))
  await action.click()
  const request = await staleRequest
  expect(new URL(request.url()).searchParams.get('tenant_id')).toBeNull()
  await page.getByRole('button', { name: '切换到目标租户' }).click()
  await expect(page.getByText('目标租户中心', { exact: true })).toBeVisible()
  delayAllTenantsExport = false
  pending.resolve()
  const response = await request.response()
  expect(response?.ok()).toBe(true)
  await response?.finished()

  // Only the newly selected tenant is displayed after the old response finishes.
  const selectedRequest = page.waitForRequest((request) => isExport(new URL(request.url())))
  await action.click()
  expect(new URL((await selectedRequest).url()).searchParams.get('tenant_id')).toBe(
    `eq.${tenantIds[1]}`
  )
  const dialog = page.getByRole('dialog', { name: '工作中心二维码 · 1 个' })
  await expect(dialog.getByText('目标租户中心', { exact: true })).toBeVisible()
  await expect(dialog.getByText('原租户中心', { exact: true })).toHaveCount(0)
  await expect(dialog.locator('canvas')).toHaveCount(1)
  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  const excelRuntime = '**/deps/exceljs.js?*'
  const pendingRuntime = Promise.withResolvers<void>()
  await page.route(excelRuntime, async (route) => {
    await pendingRuntime.promise
    await route.continue()
  })
  const excelRequest = page.waitForRequest(excelRuntime)
  await dialog.getByRole('button', { name: '下载 Excel 标签' }).click()
  const loadingExcel = await excelRequest
  // Application scope can change while the modal owns focus and the export is still loading.
  await page.getByRole('button', { name: '切换到全部租户' }).dispatchEvent('click')
  pendingRuntime.resolve()
  await (await loadingExcel.response())?.finished()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('原租户中心', { exact: true })).toBeVisible()
  await action.click()
  await expect(dialog.getByText('原租户中心', { exact: true })).toBeVisible()
  const downloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: '下载 Excel 标签' }).click()
  const file = await (await downloading).path()
  if (!file) throw new Error('切换后重新导出的 Excel 标签未生成')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(file)
  expect(workbook.getWorksheet('工作中心二维码')?.getCell('A2').value).toBe('WC-OLD')
  expect(downloads).toEqual(['工作中心二维码.xlsx'])
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
})
