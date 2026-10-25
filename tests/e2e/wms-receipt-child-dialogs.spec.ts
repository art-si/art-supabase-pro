import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('收料库位加载原位重试及保存失败保留选择', async ({ page }, testInfo) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/mdm_warehouse?*', (route) =>
    route.fulfill({
      json: {
        id: 'receipt-warehouse',
        warehouse_code: 'WH-001',
        warehouse_name: '测试收料仓库',
        enable_locations: true
      }
    })
  )
  let loadFailed = true
  await page.route('**/rest/v1/mdm_warehouse_bin?*', (route) =>
    route.fulfill(
      loadFailed
        ? { status: 503, json: { code: 'XX000', message: '测试收料库位读取失败' } }
        : {
            json: [
              {
                id: 'bin-sn',
                warehouse_id: 'receipt-warehouse',
                bin_code: 'BIN-SN',
                bin_name: '序列号库位',
                supports_serial: true
              },
              {
                id: 'bin-board',
                warehouse_id: 'receipt-warehouse',
                bin_code: 'BIN-BOARD',
                bin_name: '板材库位',
                supports_serial: false
              }
            ]
          }
    )
  )
  let saveFailed = true
  let recommendation = 0
  await page.route('**/rpc/wms_recommend_bin_secure', (route) => {
    recommendation += 1
    return route.fulfill(
      recommendation === 3
        ? { status: 400, json: { code: 'P0001', message: '测试推荐失败' } }
        : { json: recommendation === 1 ? 'bin-board' : recommendation === 2 ? null : 'bin-sn' }
    )
  })
  const writes: unknown[] = []
  await page.route('**/rpc/wms_set_receipt_line_bin_secure', (route) => {
    writes.push(route.request().postDataJSON())
    return route.fulfill(
      saveFailed
        ? { status: 400, json: { code: 'P0001', message: '测试收料库位保存失败' } }
        : { json: null }
    )
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/wms-operation-retry.html')
  await page.getByRole('button', { name: '测试收料库位', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('库位信息加载失败', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeDisabled()
  await page.screenshot({
    path: testInfo.outputPath('receipt-bin-load-error.png'),
    animations: 'disabled'
  })
  loadFailed = false
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByText('请选择入库库位或使用自动选位', { exact: true })).toBeVisible()
  expect(writes).toHaveLength(0)
  const recommend = dialog.getByRole('button', { name: '自动选位', exact: true })
  await recommend.click()
  await expect(
    page.getByText('推荐库位不支持序列号，请手动选择支持序列号的库位', { exact: true })
  ).toBeVisible()
  await expect(dialog.getByText('BIN-BOARD · 板材库位', { exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  expect(writes).toHaveLength(0)
  await recommend.click()
  await expect(
    page.getByText('当前没有符合物料、容量和库区规则的可用库位', { exact: true })
  ).toBeVisible()
  await recommend.click()
  await expect(
    page.locator('.el-message__content').filter({ hasText: '测试推荐失败' })
  ).toHaveCount(1)
  await expect(
    page.getByText('自动选位失败，请手动选择库位或稍后重试', { exact: true })
  ).toHaveCount(0)
  await recommend.click()
  await expect(dialog.getByText('BIN-SN · 序列号库位', { exact: true })).toBeVisible()
  expect(writes).toHaveLength(0)
  await dialog.getByRole('combobox').press('ArrowDown')
  await expect(page.getByRole('option', { name: 'BIN-BOARD · 板材库位', exact: true })).toHaveCount(
    0
  )
  await page.getByRole('option', { name: 'BIN-SN · 序列号库位', exact: true }).click()
  await expect(page.locator('.el-message')).toHaveCount(0, { timeout: 15_000 })
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByText('测试收料库位保存失败', { exact: true }).first()).toBeVisible()
  await expect(dialog.getByText('BIN-SN · 序列号库位', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('receipt-bin-save-error.png'),
    animations: 'disabled'
  })
  saveFailed = false
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(writes).toEqual([1, 2].map(() => ({ p_line_id: 'receipt-line-test', p_bin_id: 'bin-sn' })))
  await page.getByRole('button', { name: '测试收料库位', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
  await expect(dialog.getByText('BIN-SN · 序列号库位', { exact: true })).toHaveCount(0)
  let releaseRecommendation!: () => void
  const heldRecommendation = new Promise<void>((resolve) => {
    releaseRecommendation = resolve
  })
  let recommendationStarted!: () => void
  const started = new Promise<void>((resolve) => {
    recommendationStarted = resolve
  })
  await page.route('**/rpc/wms_recommend_bin_secure', async (route) => {
    recommendationStarted()
    await heldRecommendation
    await route.fulfill({ json: 'bin-sn' })
  })
  await recommend.click()
  await started
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('combobox')).toBeDisabled()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '测试收料库位', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
  const oldResponse = page.waitForResponse((response) =>
    response.url().includes('wms_recommend_bin_secure')
  )
  releaseRecommendation()
  await oldResponse
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(dialog.getByText('BIN-SN · 序列号库位', { exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByText('请选择入库库位或使用自动选位', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(writes).toHaveLength(2)
  expect(errors).toEqual([])
})

test('收料序列号逐件校验及保存失败重试', async ({ page }, testInfo) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  let failed = true
  const writes: unknown[] = []
  await page.route('**/rpc/wms_set_receipt_line_serials_secure', (route) => {
    writes.push(route.request().postDataJSON())
    return route.fulfill(
      failed
        ? { status: 400, json: { code: 'P0001', message: '测试收料 SN 保存失败' } }
        : { json: null }
    )
  })
  await page.goto('/tests/e2e/fixtures/wms-operation-retry.html')
  await page.getByRole('button', { name: '测试收料 SN', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const input = dialog.getByRole('textbox')
  await input.fill('SN-001\nSN-001')
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(
    page.getByText('SN 编码必须逐件唯一，件数应等于本行库存数量', { exact: true })
  ).toBeVisible()
  expect(writes).toHaveLength(0)
  await input.fill('SN-001\nSN-002')
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByText('测试收料 SN 保存失败', { exact: true }).first()).toBeVisible()
  await expect(input).toHaveValue('SN-001\nSN-002')
  await page.screenshot({
    path: testInfo.outputPath('receipt-sn-save-error.png'),
    animations: 'disabled'
  })
  failed = false
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(writes).toEqual(
    [1, 2].map(() => ({
      p_line_id: 'receipt-line-test',
      p_serial_nos: ['SN-001', 'SN-002']
    }))
  )
  await page.getByRole('button', { name: '测试收料 SN', exact: true }).click()
  await expect(input).toHaveValue('')
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog.getByText('请录入本行全部 SN', { exact: true })).toBeVisible()
  expect(writes).toHaveLength(2)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
})
