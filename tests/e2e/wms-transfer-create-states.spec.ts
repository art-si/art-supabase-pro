import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('分步调拨新增重开后旧资料失败不覆盖新表单', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let writes = 0
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() !== 'GET') writes++
    return route.fulfill({ json: [] })
  })
  let releaseOld!: () => void
  const held = new Promise<void>((resolve) => {
    releaseOld = resolve
  })
  let markStarted!: () => void
  const started = new Promise<void>((resolve) => {
    markStarted = resolve
  })
  let reads = 0
  await page.route('**/rest/v1/mdm_warehouse?*', async (route) => {
    reads++
    if (reads === 1) {
      markStarted()
      await held
      await route.fulfill({ status: 503, json: { code: 'XX000', message: '旧调拨仓库加载失败' } })
    } else await route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/wms-operation-retry.html')
  const trigger = page.getByRole('button', { name: '测试调拨创建', exact: true })
  await trigger.click()
  await started
  const dialog = page.getByRole('dialog', { name: '新建分步调拨单', exact: true })
  await dialog.getByRole('button', { name: /^(关闭此对话框|Close this dialog)$/ }).click()
  await expect(dialog).toBeHidden()
  await trigger.click()
  await expect(dialog.getByPlaceholder('选择来源批次', { exact: true })).toBeVisible()
  const oldResponse = page.waitForResponse((response) => response.url().includes('/mdm_warehouse'))
  releaseOld()
  await oldResponse
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(dialog.getByRole('button', { name: '重新加载', exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
  await expect(dialog.getByPlaceholder('选择来源批次', { exact: true })).toHaveValue('')
  await page.screenshot({
    path: testInfo.outputPath('transfer-create-reopened.png'),
    animations: 'disabled'
  })
  const reason = dialog.getByRole('textbox', { name: '调拨原因', exact: true })
  await reason.scrollIntoViewIfNeeded()
  await expect(reason).toBeInViewport()
  const belowFooter = await dialog.evaluate((element) => {
    const input = element.querySelector('textarea')!.getBoundingClientRect()
    const footer = element.querySelector('.el-dialog__footer')!.getBoundingClientRect()
    return input.bottom > footer.top + 1
  })
  expect(belowFooter).toBe(false)
  await page.screenshot({
    path: testInfo.outputPath('transfer-create-lower.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  expect(writes).toBe(0)
  expect(errors).toEqual([])
})
