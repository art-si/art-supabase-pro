import { expect, test } from '@playwright/test'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })

const fixturePath = '/tests/e2e/fixtures/scm-receipt-dialog-feedback.html'

test('收料 SN 弹窗区分字段错误和保存错误', async ({ page, request }, testInfo) => {
  test.setTimeout(180_000)
  const dark = /dark|mobile/.test(testInfo.project.name)
  const appearance = { theme: dark ? 'dark' : 'light', boxBorderMode: !dark } as const
  await prepareAppearance(page, appearance)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const responseGate = Promise.withResolvers<void>()
  const writes: unknown[] = []
  let failed = true
  await page.route('**/rest/v1/rpc/wms_set_receipt_line_serials_secure', async (route) => {
    writes.push(route.request().postDataJSON())
    await responseGate.promise
    await route.fulfill(
      failed
        ? {
            status: 400,
            json: { code: '23514', message: '序列号已被其他入库单占用，请更换后重试' }
          }
        : { json: null }
    )
  })
  await expect
    .poll(async () => (await request.get(fixturePath)).text(), { timeout: 90_000 })
    .toContain('<title>收料弹窗反馈验收</title>')
  await page.goto(fixturePath, { waitUntil: 'domcontentloaded' })
  await assertAppearance(page, appearance)

  await page.getByRole('button', { name: '打开收料 SN' }).click()
  const dialog = page.getByRole('dialog', { name: '录入收料序列号' })
  await expect(dialog).toBeVisible()
  const serials = dialog.getByRole('textbox', { name: /序列号清单/ })
  await expect(serials).toBeEditable()
  const confirm = dialog.getByRole('button', { name: '确定' })
  await confirm.click()
  await expect(dialog.getByText('请录入本行全部 SN')).toBeVisible()
  await expect(serials).toBeFocused()
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  expect(writes).toEqual([])

  await serials.fill('SN-001\nSN-002')
  await confirm.focus()
  await page.keyboard.press('Enter')
  try {
    await expect.poll(() => writes.length).toBe(1)
    await expect(confirm).toBeDisabled()
    await expect(serials).toBeVisible()
    await expect(serials).not.toBeEditable()
    await page.keyboard.press('Enter')
  } finally {
    responseGate.resolve()
  }
  await expect(page.getByText('序列号已被其他入库单占用，请更换后重试')).toBeVisible()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(dialog).toBeVisible()
  await expect(serials).toHaveValue('SN-001\nSN-002')
  await expect(serials).toBeEditable()
  await expect(confirm).toBeFocused()
  expect(writes).toEqual([
    {
      p_line_id: '22222222-2222-4222-8222-222222222222',
      p_serial_nos: ['SN-001', 'SN-002']
    }
  ])
  await page.screenshot({
    path: `.artifacts/scm-receipt-serial-feedback-${testInfo.project.name}.png`,
    animations: 'disabled'
  })
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)

  failed = false
  await serials.fill('SN-RETRY-001\nSN-RETRY-002')
  await confirm.press('Enter')
  await expect(dialog).toBeHidden()
  expect(writes).toEqual([
    {
      p_line_id: '22222222-2222-4222-8222-222222222222',
      p_serial_nos: ['SN-001', 'SN-002']
    },
    {
      p_line_id: '22222222-2222-4222-8222-222222222222',
      p_serial_nos: ['SN-RETRY-001', 'SN-RETRY-002']
    }
  ])
  await page.getByRole('button', { name: '打开收料 SN' }).click()
  await expect(serials).toBeEditable()
  await expect(serials).toHaveValue('')
  await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(writes).toHaveLength(2)
  expect(errors).toEqual([])
})

test('入库库位保存失败时保留选择并提示', async ({ page, request }, testInfo) => {
  test.setTimeout(180_000)
  const dark = /dark|mobile/.test(testInfo.project.name)
  const appearance = { theme: dark ? 'dark' : 'light', boxBorderMode: !dark } as const
  await prepareAppearance(page, appearance)
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
        },
        {
          id: '88888888-8888-4888-8888-888888888888',
          warehouse_id: '55555555-5555-4555-8555-555555555555',
          bin_code: 'BIN-02',
          bin_name: '备用库位',
          supports_serial: true
        }
      ])
    })
  )
  const responseGate = Promise.withResolvers<void>()
  const writes: unknown[] = []
  let failed = true
  let recommendations = 0
  await page.route('**/rest/v1/rpc/wms_recommend_bin_secure', (route) => {
    recommendations++
    return route.fulfill({ json: '77777777-7777-4777-8777-777777777777' })
  })
  await page.route('**/rest/v1/rpc/wms_set_receipt_line_bin_secure', async (route) => {
    writes.push(route.request().postDataJSON())
    await responseGate.promise
    await route.fulfill(
      failed
        ? { status: 400, json: { code: '23514', message: '库位容量不足，请重新选择库位' } }
        : { json: null }
    )
  })
  await expect
    .poll(async () => (await request.get(fixturePath)).text(), { timeout: 90_000 })
    .toContain('<title>收料弹窗反馈验收</title>')
  await page.goto(fixturePath, { waitUntil: 'domcontentloaded' })
  await assertAppearance(page, appearance)

  await page.getByRole('button', { name: '打开入库库位' }).click()
  const dialog = page.getByRole('dialog', { name: '指定入库库位' })
  await expect(dialog).toBeVisible()
  const placement = dialog.getByRole('combobox', { name: '入库库位' })
  const recommend = dialog.getByRole('button', { name: '自动选位', exact: true })
  const confirm = dialog.getByRole('button', { name: '确定', exact: true })
  await placement.click()
  await page.getByRole('option', { name: 'BIN-01 · 测试库位' }).click()
  await confirm.press('Enter')
  try {
    await expect.poll(() => writes.length).toBe(1)
    await expect(confirm).toBeDisabled()
    await expect(placement).toBeDisabled()
    await expect(recommend).toBeDisabled()
    expect(recommendations).toBe(0)
    await page.keyboard.press('Enter')
  } finally {
    responseGate.resolve()
  }
  await expect(page.getByText('库位容量不足，请重新选择库位')).toBeVisible()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('BIN-01 · 测试库位')).toBeVisible()
  await expect(placement).toBeEnabled()
  await expect(recommend).toBeEnabled()
  await expect(confirm).toBeFocused()
  expect(writes).toEqual([
    {
      p_line_id: '22222222-2222-4222-8222-222222222222',
      p_bin_id: '77777777-7777-4777-8777-777777777777'
    }
  ])
  await page.screenshot({
    path: `.artifacts/scm-receipt-bin-feedback-${testInfo.project.name}.png`,
    animations: 'disabled'
  })
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
  failed = false
  await placement.click()
  await page.getByRole('option', { name: 'BIN-02 · 备用库位' }).click()
  await confirm.press('Enter')
  await expect(dialog).toBeHidden()
  expect(writes).toEqual([
    {
      p_line_id: '22222222-2222-4222-8222-222222222222',
      p_bin_id: '77777777-7777-4777-8777-777777777777'
    },
    {
      p_line_id: '22222222-2222-4222-8222-222222222222',
      p_bin_id: '88888888-8888-4888-8888-888888888888'
    }
  ])
  await page.getByRole('button', { name: '打开入库库位' }).click()
  await expect(placement).toBeEnabled()
  await expect(recommend).toBeEnabled()
  await expect(dialog.getByText('BIN-02 · 备用库位')).toHaveCount(0)
  await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(writes).toHaveLength(2)
  expect(recommendations).toBe(0)
  expect(errors).toEqual([])
})
