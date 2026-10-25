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
