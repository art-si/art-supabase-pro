import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

test('检验类别弹窗区分字段校验与服务拒绝', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)
  const unexpected: string[] = []
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    unexpected.push(`${route.request().method()} ${route.request().url()}`)
    return route.fulfill({ status: 400, json: { message: 'unexpected isolated request' } })
  })
  await page.route('**/rest/v1/sys_param?*', (route) => {
    const request = route.request()
    if (
      request.method() === 'GET' &&
      new URL(request.url()).searchParams.get('param_key') === 'eq.ui.appearance.config'
    ) {
      return route.fulfill({ json: [] })
    }
    unexpected.push(`${request.method()} ${request.url()}`)
    return route.fulfill({ status: 400, json: { message: 'unexpected isolated parameter' } })
  })
  const registry = Promise.withResolvers<void>()
  const registryRequested = Promise.withResolvers<void>()
  page.once('close', () => registry.resolve())
  await page.route('**/components/core/forms/art-form/components.ts*', async (route) => {
    registryRequested.resolve()
    await registry.promise
    await route.continue()
  })

  let saveRequests = 0
  await page.route('**/rest/v1/rpc/smis_save_inspection_category_secure', async (route) => {
    saveRequests += 1
    await route.fulfill({
      status: 403,
      json: { code: '42501', message: 'permission denied for relation' }
    })
  })

  await page.goto('/modules/art-supabase-smis/tests/e2e/fixtures/inspection-category-feedback.html')
  await page.getByRole('button', { name: '打开检验类别弹窗' }).click()
  const dialog = page.getByRole('dialog', { name: '新增检验类别' })
  await expect(dialog).toBeVisible()
  const save = dialog.getByRole('button', { name: '保存检验类别' })
  await registryRequested.promise
  await expect(dialog.locator('.el-skeleton').first()).toBeVisible()
  await expect(save).toBeDisabled()
  expect(saveRequests).toBe(0)
  await page.screenshot({
    path: testInfo.outputPath('controls-loading.png'),
    animations: 'disabled'
  })
  registry.resolve()
  await expect(dialog.getByRole('textbox', { name: '检验类别编码' })).toBeVisible()
  await expect(save).toBeEnabled()
  await save.click()
  await expect(dialog.getByText('请输入检验类别编码')).toBeVisible()
  expect(saveRequests).toBe(0)
  await expect(page.locator('.el-message')).toHaveCount(0)

  await dialog.getByRole('textbox', { name: '检验类别编码' }).fill('EXTERNAL')
  await dialog.getByRole('textbox', { name: '检验类别名称' }).fill('外部检验')
  await dialog.getByRole('button', { name: '保存检验类别' }).click()
  await expect(page.locator('.el-message')).toHaveCount(1)
  await expect(page.locator('.el-message')).toContainText('当前账号没有此操作权限')
  expect(saveRequests).toBe(1)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '保存检验类别' })).toBeEnabled()

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
  await page.screenshot({
    path: testInfo.outputPath('inspection-category-error.png'),
    animations: 'disabled'
  })
  await dialog.getByText('备注', { exact: true }).scrollIntoViewIfNeeded()
  await expect(dialog.getByText('备注', { exact: true })).toBeInViewport()
  await expect(dialog.getByRole('button', { name: '保存检验类别' })).toBeInViewport()
  await page.screenshot({
    path: testInfo.outputPath('inspection-category-lower.png'),
    animations: 'disabled'
  })
  expect(unexpected).toEqual([])
  expect(pageErrors).toEqual([])
})
