import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
test('收料明细保留批号回显并加载完整批号记录', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith('/wms_inventory_batch')
        ? [
            {
              batch_no: 'BATCH-001',
              material_id: 'material-test',
              quantity: 5,
              warehouse_id: 'warehouse-test',
              received_at: '2026-10-08'
            }
          ]
        : [],
      headers: { 'content-range': '0-0/1' }
    })
  )
  await page.goto('/tests/e2e/fixtures/warehouse-selector-reuse.html')
  await page.getByRole('button', { name: '打开收料批号', exact: true }).click()
  const owner = page.getByRole('dialog').first()
  await owner.locator('.el-table__expand-icon').first().click()
  const batchInput = owner.getByRole('textbox', { name: '批号 清空', exact: true })
  await expect(batchInput).toHaveValue('BATCH-001')
  await batchInput.click()
  const picker = page.getByRole('dialog', { name: '批号主档', exact: true })
  await expect(picker.getByRole('row').filter({ hasText: 'BATCH-001' })).toBeVisible()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(batchInput).toHaveValue('BATCH-001')
  await owner.locator('.el-table .el-scrollbar__wrap').evaluateAll((elements) => {
    for (const element of elements) element.scrollLeft = 0
  })
  await page.screenshot({ path: info.outputPath('receipt-batch.png') })
  expect(errors).toEqual([])
})
