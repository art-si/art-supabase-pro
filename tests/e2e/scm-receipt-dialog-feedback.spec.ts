import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

const fixturePath = '/tests/e2e/fixtures/scm-receipt-dialog-feedback.html'

test('收料 SN 弹窗区分字段错误和保存错误', async ({ page, request }, testInfo) => {
  test.setTimeout(180_000)
  await page.route('**/rest/v1/rpc/wms_set_receipt_line_serials_secure', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ code: '23514', message: '序列号已被其他入库单占用，请更换后重试' })
    })
  )
  await expect
    .poll(async () => (await request.get(fixturePath)).text(), { timeout: 90_000 })
    .toContain('<title>收料弹窗反馈验收</title>')
  await page.goto(fixturePath, { waitUntil: 'domcontentloaded' })
  if (testInfo.project.name.includes('dark'))
    await page.evaluate(() => document.documentElement.classList.add('dark'))

  await page.getByRole('button', { name: '打开收料 SN' }).click()
  const dialog = page.getByRole('dialog', { name: '录入收料序列号' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '确定' }).click()
  await expect(dialog.getByText('请录入本行全部 SN')).toBeVisible()
  await expect(page.locator('.el-message--error')).toHaveCount(0)

  await dialog.locator('textarea').fill('SN-001\nSN-002')
  await dialog.getByRole('button', { name: '确定' }).click()
  await expect(page.getByText('序列号已被其他入库单占用，请更换后重试')).toBeVisible()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('textarea')).toHaveValue('SN-001\nSN-002')
  await page.screenshot({
    path: `.artifacts/scm-receipt-serial-feedback-${testInfo.project.name}.png`,
    animations: 'disabled'
  })
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
})

test('入库库位保存失败时保留选择并提示', async ({ page, request }, testInfo) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/mdm_unit_of_measure?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/mdm_warehouse?*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: '55555555-5555-4555-8555-555555555555',
        warehouse_code: 'TEST-WH',
        warehouse_name: '测试仓库',
        enable_locations: true
      })
    })
  )
  await page.route('**/rest/v1/mdm_warehouse_bin?*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: '77777777-7777-4777-8777-777777777777',
          warehouse_id: '55555555-5555-4555-8555-555555555555',
          bin_code: 'BIN-01',
          bin_name: '测试库位',
          supports_serial: true
        }
      ])
    })
  )
  await page.route('**/rest/v1/rpc/wms_set_receipt_line_bin_secure', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ code: '23514', message: '库位容量不足，请重新选择库位' })
    })
  )
  await expect
    .poll(async () => (await request.get(fixturePath)).text(), { timeout: 90_000 })
    .toContain('<title>收料弹窗反馈验收</title>')
  await page.goto(fixturePath, { waitUntil: 'domcontentloaded' })
  if (testInfo.project.name.includes('dark'))
    await page.evaluate(() => document.documentElement.classList.add('dark'))

  await page.getByRole('button', { name: '打开入库库位' }).click()
  const dialog = page.getByRole('dialog', { name: '指定入库库位' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('combobox', { name: '入库库位' }).click()
  await page.getByRole('option', { name: 'BIN-01 · 测试库位' }).click()
  await dialog.getByRole('button', { name: '确定' }).click()
  await expect(page.getByText('库位容量不足，请重新选择库位')).toBeVisible()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('BIN-01 · 测试库位')).toBeVisible()
  await page.screenshot({
    path: `.artifacts/scm-receipt-bin-feedback-${testInfo.project.name}.png`,
    animations: 'disabled'
  })
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
  expect(errors).toEqual([])
})
