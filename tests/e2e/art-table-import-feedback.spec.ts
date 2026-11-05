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
  test.setTimeout(90_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(`${previewPath}?mode=reject`, { waitUntil: 'domcontentloaded' })
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

test('没有业务 context key 时，租户切换丢弃旧 XLSX 并允许新租户重选', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${previewPath}?mode=success`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: '导入测试数据' })).toBeVisible()
  let signal: (() => void) | undefined
  let release: (() => void) | undefined
  const requested = new Promise<void>((resolve) => (signal = resolve))
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/src/utils/file/sheetjs.ts*', async (route) => {
    signal?.()
    await held
    await route.continue()
  })
  const input = page.locator('input[type="file"]')
  try {
    const buffer = await buildWorkbook()
    await input.setInputFiles({
      name: '站点.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer
    })
    await requested
    await page.getByTestId('import-scope-b').click()
    await expect(input).toHaveValue('')
    expect(await page.locator('body').getAttribute('data-received-rows')).toBe('0')
    const oldResponse = page.waitForResponse('**/src/utils/file/sheetjs.ts*')
    release?.()
    await oldResponse
    await input.setInputFiles({
      name: '站点.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer
    })
    await expect(page.locator('body')).toHaveAttribute('data-received-rows', '1')
    await expect(page.locator('body')).toHaveAttribute(
      'data-received-tenant',
      '22222222-2222-4222-8222-222222222222'
    )
    expect(errors).toEqual([])
  } finally {
    release?.()
  }
})

test('普通用户的路由推导导入权限在转换期间撤销后不提交 XLSX', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${previewPath}?mode=revoke-permission`, { waitUntil: 'domcontentloaded' })
  const importButton = page.getByRole('button', { name: '导入测试数据' })
  await expect(importButton).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    name: '合同.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await buildWorkbook()
  })
  await expect(page.locator('body')).toHaveAttribute('data-transform-status', 'pending')
  await page.getByTestId('revoke-import-permission').click()
  await expect(importButton).toHaveCount(0)
  await page.evaluate(async () => {
    document.dispatchEvent(new Event('release-transform'))
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
  })
  await expect(page.locator('body')).toHaveAttribute('data-transform-status', 'released')
  await expect(page.locator('body')).toHaveAttribute('data-received-rows', '0')
  await expect(page.locator('body')).not.toHaveAttribute('data-import-status', 'success')
  expect(errors).toEqual([])
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
