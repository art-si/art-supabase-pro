import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'

const previewPath = '/tests/e2e/fixtures/art-table-import.html'

const buildWorkbook = async (): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('站点')
  sheet.addRow(['名称'])
  sheet.addRow(['东区分拨站'])
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

test('导入提交失败有准确提示、恢复按钮状态且没有未捕获异常', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(`${previewPath}?mode=reject`)
  const button = page.getByRole('button', { name: '导入测试数据' })
  await expect(button).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    name: '站点.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await buildWorkbook()
  })
  await expect(page.locator('body')).toHaveAttribute('data-received-rows', '1')
  await expect(button).toBeDisabled()
  await page.evaluate(() => document.dispatchEvent(new Event('release-import')))
  await expect(page.getByText('请先在顶部选择导入目标租户')).toBeVisible()
  await expect(button).toBeEnabled()
  await page.screenshot({
    path: '.artifacts/art-table-import-error-desktop.png',
    animations: 'disabled'
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByText('请先在顶部选择导入目标租户')).toBeVisible()
  const overflow = await page.locator('body').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
  await page.screenshot({
    path: '.artifacts/art-table-import-error-mobile.png',
    animations: 'disabled'
  })
  expect(pageErrors).toEqual([])
})

test('导入成功后只触发成功反馈', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(`${previewPath}?mode=success`)
  await page.locator('input[type="file"]').setInputFiles({
    name: '站点.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await buildWorkbook()
  })
  await expect(page.locator('body')).toHaveAttribute('data-import-status', 'success')
  await expect(page.getByText('导入成功')).toBeVisible()
  await expect(page.getByRole('button', { name: '导入测试数据' })).toBeEnabled()
  expect(pageErrors).toEqual([])
})

test('响应层已经提示写入失败时，表格不重复弹出错误', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(`${previewPath}?mode=reported`)
  await page.locator('input[type="file"]').setInputFiles({
    name: '站点.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await buildWorkbook()
  })
  await expect(page.locator('body')).toHaveAttribute('data-received-rows', '1')
  await expect(page.getByText('站点编码重复')).toBeVisible()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '导入测试数据' })).toBeEnabled()
  expect(pageErrors).toEqual([])
})

test('共用反馈将技术异常转为可读提示，且跳过已提示的异常', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(previewPath)

  await page.evaluate(async () => {
    const feedbackModuleUrl = '/src/hooks/core/useArtFeedback.ts'
    const errorModuleUrl = '/src/utils/supabase/error.ts'
    const { notifyFriendlyError } = await import(feedbackModuleUrl)
    const { markErrorAsUserNotified } = await import(errorModuleUrl)
    notifyFriendlyError(new Error('relation missing in PostgREST'), '保存失败，请稍后重试')
    notifyFriendlyError(
      new Error('业务操作被拒绝', { cause: markErrorAsUserNotified(new Error('已显示过')) }),
      '保存失败，请稍后重试'
    )
  })

  await expect(page.getByText('保存失败，请稍后重试')).toBeVisible()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(page.getByText('relation missing in PostgREST')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})
